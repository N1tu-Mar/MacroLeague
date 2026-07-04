// ─────────────────────────────────────────────────────────────────────────
// MacroLeague design system — light-first redesign (July 2026)
//
// Direction: LIGHT-first, editorial-sporty. Warm-neutral canvas, ink text, a
// single scarlet brand accent (#D9364A) for the one primary action + league
// identity. Gold only in Rewards / 1st place. DM Sans for interface copy,
// Barlow Condensed reserved for competitive numerals (scores, ranks, LP, XP,
// countdowns, streaks, stat values).
//
// Runtime theming: `Colors` below is the LIGHT palette and exists for
// backwards-compat (legacy screens import it directly). New/redesigned code
// should read the active palette from `useTheme()` so light↔dark works. All
// tokens (Type/Spacing/Radius/Shadow/Motion) are palette-independent.
// ─────────────────────────────────────────────────────────────────────────

import { lightColors, darkColors, ThemeColors } from './palettes';

export { lightColors, darkColors };
export type { ThemeColors };
export { ThemeProvider, useTheme } from './ThemeProvider';
export type { ThemeMode } from './ThemeProvider';

/** Back-compat default palette (light). Prefer `useTheme().colors` in new code. */
export const Colors = lightColors;

/**
 * Compose an 8-digit hex from a base color + 0..1 opacity. Falls back to the
 * raw color if it isn't a 6-digit hex (e.g. an rgba string).
 */
export function alpha(hex: string, opacity: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const clamped = Math.max(0, Math.min(1, opacity));
  const suffix = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${suffix}`;
}

// ── Fonts ────────────────────────────────────────────────────────────────
// DM Sans = all interface copy. Barlow Condensed (num*) = competitive numerals
// ONLY. Font files are loaded in App.tsx; these strings must match the loaded
// @expo-google-fonts keys.
export const FontFamily = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
  // Competitive numerals — Barlow Condensed
  numMedium: 'BarlowCondensed_500Medium',
  numSemibold: 'BarlowCondensed_600SemiBold',
  numBold: 'BarlowCondensed_700Bold',
  // Back-compat aliases used across legacy screens (now DM Sans)
  displayBold: 'DMSans_700Bold',
  displaySemiBold: 'DMSans_600SemiBold',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemiBold: 'DMSans_600SemiBold',
} as const;

// Legacy numeric scale (kept stable for screens not yet migrated to `Type`).
export const FontSize = {
  hero: 56,
  display: 40,
  title: 28,
  heading: 22,
  subhead: 18,
  body: 15,
  label: 13,
  meta: 11,
  micro: 10,
} as const;

// Typography roles (spec F2) — color-free style fragments. Spread into a style
// and add the themed color: `[Type.title, { color: colors.ink }]`.
// Barlow Condensed for every `score*`/`num*` role; DM Sans for the rest.
export const Type = {
  scoreHero: { fontFamily: FontFamily.numBold, fontSize: 72, lineHeight: 66 },
  scoreDisplay: { fontFamily: FontFamily.numBold, fontSize: 40, lineHeight: 40 },
  scoreMed: { fontFamily: FontFamily.numBold, fontSize: 30, lineHeight: 32 },
  scoreStat: { fontFamily: FontFamily.numBold, fontSize: 22, lineHeight: 24 },
  numInline: { fontFamily: FontFamily.numBold, fontSize: 15, lineHeight: 16 },

  titleLg: { fontFamily: FontFamily.bold, fontSize: 40, lineHeight: 44, letterSpacing: -1 },
  titleSm: { fontFamily: FontFamily.bold, fontSize: 30, lineHeight: 34, letterSpacing: -0.6 },
  title: { fontFamily: FontFamily.bold, fontSize: 28, lineHeight: 32, letterSpacing: -0.56 },
  heading: { fontFamily: FontFamily.bold, fontSize: 26, lineHeight: 30, letterSpacing: -0.5 },
  section: { fontFamily: FontFamily.bold, fontSize: 20, lineHeight: 25, letterSpacing: -0.2 },
  subhead: { fontFamily: FontFamily.semibold, fontSize: 16, lineHeight: 22 },
  cardTitle: { fontFamily: FontFamily.semibold, fontSize: 14, lineHeight: 20 },
  bodyLg: { fontFamily: FontFamily.regular, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: FontFamily.regular, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: FontFamily.medium, fontSize: 13, lineHeight: 19 },
  labelSm: { fontFamily: FontFamily.medium, fontSize: 11.5, lineHeight: 16 },
  overline: {
    fontFamily: FontFamily.medium,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.88,
    textTransform: 'uppercase' as const,
  },
  button: { fontFamily: FontFamily.semibold, fontSize: 16.5, lineHeight: 20 },
  buttonSm: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 18 },
} as const;

// 4pt spacing scale. Screens pad 20 (auth/onboarding 22).
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  screen: 20,
} as const;

// Radius — legacy keys kept; design-named keys added.
export const Radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 28,
  pill: 999,
  // design-named
  chip: 10,
  input: 14,
  button: 14,
  card: 16,
  hero: 20,
  sheet: 24,
} as const;

// Elevation — flat by default (border-only). Light-tuned ink shadows.
export const Shadow = {
  none: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  card: {
    shadowColor: '#171A1F',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  hero: {
    shadowColor: '#171A1F',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  sheet: {
    shadowColor: '#171A1F',
    shadowOpacity: 0.16,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  // neutral (no longer a brand glow) — brand FAB uses glowShadow() below
  floating: {
    shadowColor: '#171A1F',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
} as const;

/** Colored glow for the scarlet Log FAB: `0 8px 20px rgba(217,54,74,.35)`. */
export function glowShadow(color: string, opacity = 0.35) {
  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  };
}

// Animation timing (ms). Legacy keys kept; spec-motion keys added.
export const Motion = {
  tap: 140,
  progress: 400, // spec: progress bars fill 400ms on first appear
  countUp: 400, // spec: score counts up 400ms
  reward: 320,
  sheet: 300, // sheet rise
  pop: 400, // success icon overshoot
  rankRoll: 450, // rank numeral roll
  fade: 200, // scrim fade / reduced-motion fades
  fadeReduced: 150,
} as const;
