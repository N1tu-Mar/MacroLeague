# MacroLeague design system — build conventions

MacroLeague is a **dark-theme React Native (react-native-web) component library**
for a college nutrition-league app. Components are real RN components compiled
for the browser — they style themselves at runtime via injected CSS. There are
**no utility classes**: never invent class names; style your own layout glue with
inline styles (or the `--ml-*` CSS custom properties defined in `styles.css`'s
import closure).

## Setup

No provider is required. Components render standalone, but they are designed for
a **dark background** — always place them on `Colors.background` (`#0D0D0D`) or a
`Colors.surface` (`#161616`) panel; on white they look wrong.

## Styling idiom: theme tokens via JS exports

Import the exact tokens the components themselves use — all exported from the
package alongside the components:

- `Colors` — `background`, `surface`, `surfaceElevated`, `track`, `border` (red
  outline `#7E2630`), `borderStrong`, `primary` (carmine `#A8141E`),
  `primaryDeep`, `accent` (orange, streaks/momentum), `gold` (1st place/rewards),
  `success`, `warning`, `error`, `promotion`, `relegation`, `textPrimary`
  (`#B3B3B3`), `textSecondary`, `textTertiary`, `textOnBrand`
- `alpha(hex, opacity)` — tinted backgrounds, e.g. `alpha(Colors.success, 0.14)`
- `FontFamily` — `displayBold` (Nunito_800ExtraBold, big numbers/headings),
  `displaySemiBold`, `body`, `bodyMedium`, `bodySemiBold`
- `FontSize` — `hero` 56, `display` 40, `title` 28, `heading` 22, `subhead` 18,
  `body` 15, `label` 13, `meta` 11, `micro` 10
- `Spacing` — 4-based scale: `xs` 4 … `base` 16 … `xxxl` 40
- `Radius` — `sm` 10 … `xxl` 28, `pill` 999 (corners are soft everywhere)
- `Shadow` — `card`, `hero`, `floating` (RN shadow objects)
- `Motion` — animation durations (ms)

Color is used sparingly and semantically: one carmine-red brand accent, gold only
for 1st place/rewards, green/orange/red only with meaning. Most surfaces stay
neutral charcoal. Red (`Colors.border`) is the outline color for cards/dividers.

## Where the truth lives

- `styles.css` → imports `fonts/fonts.css` (Nunito @font-faces — the theme's
  `FontFamily` values are these exact family names) and `_ds_bundle.css`
  (`--ml-*` custom properties mirroring Colors/Spacing/Radius/FontSize for CSS
  glue).
- Per-component API: `components/<group>/<Name>/<Name>.d.ts`; usage:
  `<Name>.prompt.md`.
- `guidelines/docs/icon-system.md` — icon rules; use `AppIcon` (lucide names),
  never raw emoji for UI icons.

## Idiomatic composition

```tsx
import { Card, MacroProgressBar, Pill, StreakFlame, Colors, FontFamily, FontSize, Spacing } from 'macroleague';

<div style={{ background: Colors.background, padding: Spacing.base, maxWidth: 380 }}>
  <Card variant="hero">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
      <span style={{ fontFamily: FontFamily.displayBold, fontSize: FontSize.heading, color: Colors.textPrimary }}>
        Today
      </span>
      <StreakFlame count={12} />
    </div>
    <MacroProgressBar label="Protein" current={96} target={150} />
    <MacroProgressBar label="Carbs" current={180} target={220} />
    <Pill label="ON TRACK" color={Colors.success} />
  </Card>
</div>
```

Build screens mobile-first (~360-400px content column); these are phone-app
components. Prefer composing the shipped components (Card, Pill, ProgressBar,
LeaderboardRow, …) over hand-rolling lookalikes.
