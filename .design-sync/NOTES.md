# design-sync notes — MacroLeague

Repo-specific gotchas for future syncs. The app is an Expo/React Native app, not a
packaged design system — the sync runs through a custom web prebuild.

## Current handoff status (2026-07-03)

- Local first-sync work is complete: all 22 exported components have authored
  previews, all preview cells are graded `good`, and the full browser validator
  reports `22/22 previews render cleanly` with no warnings.
- The existing remote project is pinned in `config.json`. The session that
  created it stopped before the final attended upload, so the fresh local bundle
  and remaining previews still need to be uploaded through Claude Design Sync.
- No source investigation or preview authoring should be repeated. Rebuild and
  use the existing grades/verification artifacts, then perform the remote diff
  and attended upload.

## Build pipeline

- **No dist in this repo.** `.design-sync/build-web-dist.mjs` (cfg.buildCmd) produces
  `dist/design-system.js` (ESM, fully web-resolved) + `dist/types/**` (tsc
  declarations). The converter consumes it via `cfg.entry` + package.json `types`
  (`./dist/types/index.d.ts` — field added for the sync; harmless to Expo).
- The DS export surface is `src/index.ts` (22 components + theme tokens). New
  components must be added there to sync.
- The prebuild aliases `react-native` → `react-native-web`, prefers `.web.*`
  platform forks (resolveExtensions), shims `process`/`global` via banner, and
  renames RNW's injected `<style id="react-native-stylesheet">` to
  `ds-rnweb-stylesheet` — the original id matches the render check's `[id^="r"]`
  mount probe and false-flags every authored preview as root-empty. Do not drop
  that rename.
- `tsconfig.dist.json` needs `"include": []` (the extended expo base otherwise
  pulls all of src, incl. supabase code needing node types) and typeRoots pointing
  into `.ds-sync/node_modules/@types` for `process.env` in the graph.
- `@types/node` is installed into `.ds-sync` (converter-deps dir) — a fresh clone
  must `npm i esbuild ts-morph @types/react @types/node playwright` there.

## Rendering / previews

- **Reanimated on web requires explicit dependency arrays** on
  `useAnimatedStyle`/`useAnimatedProps` (no Babel plugin in the esbuild pipeline).
  All component call sites were patched in-source (12 sites, 8 files,
  2026-07-03) — comment marker: "Explicit deps: required on web". New animated
  components must follow the same pattern or their preview crashes the page.
- The capture harness freezes the page clock at 2024-05-15T12:00:00Z. Previews
  with time-relative props must compute dates from `Date.now()` (see
  ChallengeCard preview's `inDays()` helper), never hardcode.
- Components assume the dark theme — every preview wraps stories in a
  `background: Colors.background` (or surface) glue div.
- Card-width components (~340-380px stories) need
  `cfg.overrides.<Name>.cardMode: "column"` — currently set for ChallengeCard,
  MacroProgressBar.
- Theme tokens ship two ways: runtime JS exports (Colors, Spacing, …) on the
  bundle, and `.design-sync/tokens.css` (CSS custom props, `--ml-*`) via
  `cfg.cssEntry` → `_ds_bundle.css`. tokens.css is hand-maintained — update it
  when `src/theme/index.ts` changes.
- Fonts: only Nunito (5 weights) is used by the theme; `.design-sync/fonts.css`
  maps exact loaded names (e.g. `Nunito_800ExtraBold`) to the
  `@expo-google-fonts/nunito` TTFs via cfg.extraFonts.

## Re-sync risks

- `src/theme/index.ts` edits do NOT auto-propagate to `.design-sync/tokens.css`
  (hand-maintained copy) — diff them on re-sync.
- The ChallengeCard/Countdown-style previews use `Date.now()`; their pixels
  drift with real time by design (source-based grades unaffected).
- The reanimated deps-array patches live in app source; a teammate reverting
  them breaks preview rendering silently (pages go blank, no build error).
- package.json gained `"types": "./dist/types/index.d.ts"` — if removed, the
  converter discovers zero components ([ZERO_MATCH]).
- The user was actively developing during the first sync (Sentry dep added
  mid-run); re-syncs should rebuild via the driver, not assume a clean tree.

## First-sync preview findings

- Wide row/card previews render reliably at 340–400px. Components listed under
  `cfg.overrides` use column card mode so Claude Design does not crop them in a
  multi-column preview grid.
- FoodLogItem previews need the complete service-layer `MealLog` shape,
  including nullable provenance and micronutrient fields. Displayed macros are
  multiplied by quantity.
- ActivityFeedItem does not insert `name` into its copy; authored `text` must
  include the person. The reserved `streak` icon uses PixelFlame.
- LeaderboardRow ranks 1–3 use medals, `badge` replaces the streak line, and
  promotion/relegation zones tint the left edge.
- Small animated artwork should be previewed in a 48–96px size sweep on a
  bordered surface. Primary artwork remains visible at rest; secondary flashes,
  sparks, and glints may legitimately begin hidden.
- Frozen-clock capture exposed two source issues that were fixed during the
  first sync: NutritionScoreCard now drives count-up timing from RAF timestamps,
  and FloatingXP has an `animated={false}` static/reduced-motion mode.
