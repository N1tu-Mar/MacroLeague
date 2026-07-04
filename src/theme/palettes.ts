// ─────────────────────────────────────────────────────────────────────────
// MacroLeague color palettes — light-first redesign (July 2026)
//
// Direction: LIGHT-first. Warm-neutral canvas (#F5F6F3), ink text (#171A1F),
// a single scarlet brand accent (#D9364A) used only for the primary action +
// competitive identity. Gold appears only in Rewards / 1st place. DM Sans for
// interface copy, Barlow Condensed for competitive numerals.
//
// This module exports two palettes with an IDENTICAL key set so the app can
// flip between them at runtime (see ThemeProvider). Every key the legacy code
// already imports off `Colors` (background/surface/primary/accent/gold/…)
// still exists and now resolves to a light value, so screens that haven't been
// redesigned yet keep compiling and read correctly on light. New semantic
// tokens (canvas/ink/scarlet/brandTint/streak/onPrimary/…) are additive.
// ─────────────────────────────────────────────────────────────────────────

export const lightColors = {
  // ── Surfaces ──────────────────────────────────────────────────────────
  canvas: '#F5F6F3', // app background, warm neutral
  card: '#FFFFFF', // cards, sheets, inputs
  sheet: '#F9FAF8', // bottom-sheet surface (slightly warmer than card)
  // legacy aliases (map onto the light surfaces)
  background: '#F5F6F3',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surface2: '#FFFFFF',
  track: '#EDEFEA', // progress tracks, segmented-control bg, chip bg, disabled btn

  // ── Text ──────────────────────────────────────────────────────────────
  ink: '#171A1F', // headings, values, dark hero surfaces
  textPrimary: '#171A1F',
  textSecondary: '#68707D', // supporting copy, labels
  textTertiary: '#9AA1AB', // placeholder / de-emphasized meta / "/100"
  textMuted: '#9AA1AB',
  textDisabled: '#AEB4BC', // disabled button label
  textOnBrand: '#FFFFFF', // text on a solid brand/gold/green fill
  onPrimary: '#FFFFFF', // text/icon on the scarlet primary button

  // ── Brand (scarlet) ───────────────────────────────────────────────────
  scarlet: '#D9364A', // primary action, league identity, you-row accent
  carmineDeep: '#A8141E', // pressed brand state, dark brand text
  brandTint: '#FBEAEC', // you-row highlight, selected radio bg, error banner bg
  brandTintBorder: '#F2D4D8',
  // legacy brand aliases
  primary: '#D9364A',
  primaryDeep: '#A8141E',

  // ── Semantic: success ─────────────────────────────────────────────────
  success: '#1E9E5A', // goals hit, positive delta, +XP badge bg
  successDeep: '#1E7A48', // "Strong day" text, USDA badge text
  successTint: '#E3F2E9', // success pill bg, USDA badge bg, check-circle bg
  promotion: '#1E9E5A',

  // ── Semantic: streak / momentum (orange, NOT danger) ──────────────────
  streak: '#E86A33',
  streakTint: '#FBEFE8',
  accent: '#E86A33', // legacy alias — momentum/streak orange

  // ── Semantic: gold (Rewards + 1st place only) ─────────────────────────
  gold: '#B7791B',
  goldText: '#8A6A15',
  goldTint: '#F7EFD8',
  goldActive: '#E8B931', // "ACTIVE" pass badge bg; 1st-place avatar ring
  warning: '#B7791B',

  // ── Semantic: error / destructive ─────────────────────────────────────
  error: '#C43D3D',
  danger: '#C43D3D',
  errorDeep: '#A8141E', // auth-error heading, error icon
  errorMuted: '#8A4A52', // error body copy
  relegation: '#C43D3D',

  // ── Borders / dividers ────────────────────────────────────────────────
  borderInput: '#CDD3D8', // input & secondary-button borders (1.5px)
  borderCard: '#E3E6E0', // card borders (1px)
  hairline: '#E8EAE5', // section dividers inside cards
  rowDivider: '#F0F1ED', // list-row separators
  // legacy border aliases (were red on dark — now neutral)
  border: '#E3E6E0',
  borderStrong: '#CDD3D8',

  // ── Controls / misc ───────────────────────────────────────────────────
  switchOff: '#D5D9DE', // switch off-state track; skeleton value blocks
  grabber: '#D5D9DE', // sheet grab handle
  macroCarb: '#9AA1AB', // carbs progress fill / carbs calorie segment
  macroFat: '#D5D9DE', // fat calorie segment
  dim: 'rgba(23,26,31,0.38)', // modal / sheet scrim
  medalSilver: '#8C9096',
  medalBronze: '#A9743C',

  // ── Skeleton / shimmer ────────────────────────────────────────────────
  skeleton: '#EDEFEA',
  skeletonHighlight: '#F7F8F5',
} as const;

export type ThemeColors = Record<keyof typeof lightColors, string>;

// Dark variant — mirrors every semantic role above for the runtime toggle.
export const darkColors: ThemeColors = {
  // Surfaces
  canvas: '#0E0F11',
  card: '#17191C',
  sheet: '#1A1D20',
  background: '#0E0F11',
  surface: '#17191C',
  surfaceElevated: '#1F2226',
  surface2: '#1F2226',
  track: '#24272B',

  // Text
  ink: '#F3F4F6',
  textPrimary: '#F3F4F6',
  textSecondary: '#A2A9B3',
  textTertiary: '#6E7681',
  textMuted: '#6E7681',
  textDisabled: '#565D66',
  textOnBrand: '#FFFFFF',
  onPrimary: '#FFFFFF',

  // Brand (scarlet, brightened for dark contrast)
  scarlet: '#EE4A5C',
  carmineDeep: '#B21E2E',
  brandTint: '#331A1F',
  brandTintBorder: '#4A2229',
  primary: '#EE4A5C',
  primaryDeep: '#B21E2E',

  // Success
  success: '#34C878',
  successDeep: '#7FE0A8',
  successTint: '#16281E',
  promotion: '#34C878',

  // Streak / momentum
  streak: '#F0803C',
  streakTint: '#2A1C12',
  accent: '#F0803C',

  // Gold
  gold: '#E0A93D',
  goldText: '#E8C77A',
  goldTint: '#2A2312',
  goldActive: '#E8B931',
  warning: '#E0A93D',

  // Error
  error: '#FF6B6B',
  danger: '#FF6B6B',
  errorDeep: '#FF8A8A',
  errorMuted: '#D69AA0',
  relegation: '#FF6B6B',

  // Borders / dividers
  borderInput: '#363B41',
  borderCard: '#24272B',
  hairline: '#222528',
  rowDivider: '#202327',
  border: '#24272B',
  borderStrong: '#363B41',

  // Controls / misc
  switchOff: '#3A3F45',
  grabber: '#3A3F45',
  macroCarb: '#6E7681',
  macroFat: '#3A3F45',
  dim: 'rgba(0,0,0,0.6)',
  medalSilver: '#AEB4BC',
  medalBronze: '#C58B54',

  // Skeleton
  skeleton: '#22262A',
  skeletonHighlight: '#2C3136',
};
