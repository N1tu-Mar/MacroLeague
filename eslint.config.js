// Flat ESLint config (ESLint 9) for an Expo / React Native + TypeScript app.
//
// Deliberately *not* type-aware (`recommended` rather than
// `recommendedTypeChecked`): the type-aware rules need a full program build per
// run, which roughly doubles CI time for checks `npm run typecheck` already
// performs. Correctness of types is tsc's job; this config exists to catch the
// things tsc cannot see — hook dependency bugs, unused code, stray consoles.
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.expo/**',
      'web-build/**',
      'coverage/**',
      // Generated / vendored design-sync output and scratch tooling — all
      // gitignored, none of it is app source.
      '.ds-sync/**',
      '.design-sync/**',
      'ds-bundle/**',
      'Meal tracking app design specs/**',
      'public/**',
      'android-auth/**',
      // Deno source with its own toolchain and its own `deno lint`; the Node
      // resolver and these plugins do not apply to it.
      'supabase/**',
      'eslint.config.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,

      // ── Rules turned off, with reasons ──────────────────────────────
      // TypeScript resolves every identifier already, and it understands the
      // React Native global environment (__DEV__, fetch, ...) via its lib/types.
      // Leaving no-undef on would only produce false positives here.
      'no-undef': 'off',
      // Props are typed by TypeScript; PropTypes are not used anywhere.
      'react/prop-types': 'off',
      // `catch {}` is an intentional, documented pattern in this codebase for
      // best-effort calls (analytics, badge counts) that must never surface.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // <Text> renders plain strings — HTML entity escaping is meaningless in
      // React Native and would make copy unreadable in source.
      'react/no-unescaped-entities': 'off',
      // React Native genuinely needs runtime require(): asset imports
      // (require('...png')) and lazy native-module loads that must not run at
      // import time (see notificationService).
      '@typescript-eslint/no-require-imports': 'off',

      // ── Warnings: real smells, but not worth failing a build over ───
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',

      // Dead code, not a bug: a stale import never changes behaviour, and
      // failing the build on one would block unrelated PRs. Surfaced on every
      // run so it still gets cleaned up.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // Unused `catch (e)` bindings are covered by allowEmptyCatch above.
          caughtErrors: 'none',
        },
      ],
    },
  },
);
