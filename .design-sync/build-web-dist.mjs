// Web design-system prebuild for design-sync.
//
// This Expo app has no dist/ — and the design-sync converter's own esbuild
// pass cannot resolve React Native platform forks (react-native →
// react-native-web, `.web.js` extension priority inside expo/RN packages).
// So this script produces a fully web-resolved ESM entry the converter can
// consume as if it were the package's published dist:
//   dist/design-system.js   — all components + theme, only react/react-dom external
//   dist/types/**           — .d.ts tree (auto-discovered via the dist/types convention)
//
// Run from the repo root: node .design-sync/build-web-dist.mjs
import { build } from '../.ds-sync/node_modules/esbuild/lib/main.js';
import { execSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/design-system.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  // react/react-dom stay external — the converter's reactShim maps them onto
  // the shared runtime the preview cards load from _vendor/.
  external: ['react', 'react-dom'],
  alias: { 'react-native': 'react-native-web' },
  // .web.* first: expo/RN packages ship browser forks as sibling files that
  // Metro would pick by platform; esbuild needs the explicit priority.
  resolveExtensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.web.mjs', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  jsx: 'automatic',
  loader: { '.ttf': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl' },
  define: {
    __DEV__: 'true',
    'process.env.NODE_ENV': '"development"',
    'process.env.EXPO_OS': '"web"',
  },
  // Some deps (reanimated) probe process.env keys the define list can't cover
  // one by one; browsers have no process at all. Module-scoped shim covers the
  // whole bundle without leaking a global.
  banner: { js: 'var process = globalThis.process ?? { env: { NODE_ENV: "development" } };\nvar global = globalThis;' },
  minify: false,
  logLevel: 'info',
});

// react-native-web injects <style id="react-native-stylesheet"> into <head>;
// that id collides with the design-sync render check's mount probe
// ([id^="r"]), which reads the (CSSOM-only, textually empty) style tag as an
// empty mount root. Rename the id — RNW only uses it for getElementById reuse,
// so a consistent rename is behavior-neutral.
const out = 'dist/design-system.js';
writeFileSync(out, readFileSync(out, 'utf8').replaceAll('react-native-stylesheet', 'ds-rnweb-stylesheet'));

execSync('npx tsc -p .design-sync/tsconfig.dist.json', { stdio: 'inherit' });
console.log('dist/design-system.js + dist/types ready');
