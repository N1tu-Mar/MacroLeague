// ─────────────────────────────────────────────────────────────────────────
// MacroLeague design system
//
// Direction: refined DARK, premium/sporty, ONE electric-blue brand accent,
// gold reserved for rewards/1st, semantic green/orange/red. No neon glow, no
// gradients-everywhere, no glassmorphism. Color is used sparingly and with
// meaning — most surfaces stay neutral charcoal.
//
// Backwards compatibility: every color key the rest of the app already imports
// (background/surface/surface2/primary/accent/gold/textPrimary/textSecondary/
// border/error) still exists, so screens not yet redesigned simply inherit the
// new palette. New tokens (Spacing/Radius/Shadow/FontSize/Type + extra colors)
// are additive.
// ─────────────────────────────────────────────────────────────────────────

export const Colors = {
  // Neutral GRAYSCALE foundation (no color tint in surfaces)
  background: '#0D0D0D',       // app background — neutral near-black
  surface: '#161616',          // default card
  surfaceElevated: '#1F1F1F',  // raised/important card
  surface2: '#1F1F1F',         // legacy alias of surfaceElevated
  track: '#262626',            // progress-bar track / inactive fill
  // Outlines / div boxes use the carmine+cherry red mix per design direction.
  border: '#7E2630',           // red outline (cards, dividers)
  borderStrong: '#A82C38',     // emphasized red outline

  // Brand + accents (use sparingly, semantically)
  primary: '#A8141E',          // carmine + cherry red (darker tone) — league/brand accent
  primaryDeep: '#7C0F18',      // deep carmine (pressed/darker brand)
  accent: '#FF8A4C',           // orange — streaks, momentum, urgency (not danger)
  gold: '#FFC53D',             // 1st place, trophies, rewards
  success: '#2FD27A',          // goals hit / positive progress / promotion
  warning: '#FFB020',          // caution
  error: '#FF5D5D',            // missed goals / relegation / negative
  danger: '#FF5D5D',           // alias of error

  // Semantic zone aliases (league)
  promotion: '#2FD27A',
  relegation: '#FF5D5D',

  // Text (Philippine silver instead of pure white, neutral grayscale below)
  textPrimary: '#B3B3B3',      // Philippine silver — primary text/headings/numbers
  textSecondary: '#8A8A8A',
  textTertiary: '#5C5C5C',
  textOnBrand: '#0D0D0D',      // dark text on a solid gold/green fill (not the red brand)
} as const;

/**
 * Compose an 8-digit hex from a base color + 0..1 opacity. Mirrors the existing
 * `Colors.primary + '14'` pattern but readable and reusable. Falls back to the
 * raw color if it isn't a 6-digit hex.
 */
export function alpha(hex: string, opacity: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const clamped = Math.max(0, Math.min(1, opacity));
  const suffix = Math.round(clamped * 255).toString(16).padStart(2, '0');
  return `${hex}${suffix}`;
}

export const FontFamily = {
  // Nunito throughout — rounded, friendly, highly legible. Weight conveys the
  // "display vs body" hierarchy now that one family is used everywhere.
  displayBold: 'Nunito_800ExtraBold',   // big numbers / headings
  displaySemiBold: 'Nunito_700Bold',
  body: 'Nunito_400Regular',
  bodyMedium: 'Nunito_500Medium',
  bodySemiBold: 'Nunito_600SemiBold',
} as const;

// Type scale — bold, readable, large hero numbers. Pair `display*` families with
// the big sizes and `body*` with the small ones.
export const FontSize = {
  hero: 56,     // rank / nutrition score hero numbers
  display: 40,  // large stats
  title: 28,    // screen titles
  heading: 22,  // section heroes
  subhead: 18,
  body: 15,
  label: 13,
  meta: 11,
  micro: 10,
} as const;

// 4-based spacing scale (4,8,12,16,20,24,32,40). Use generously on mobile.
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

// Soft, rounded corners. Small elements small, cards medium, hero cards large.
export const Radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 28,
  pill: 999,
} as const;

// Subtle elevation. Use `card` for normal cards, `hero` for the dominant card,
// `floating` for the raised Log button / modals only.
export const Shadow = {
  none: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  hero: {
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  floating: {
    shadowColor: Colors.primary,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
} as const;

// Animation timing (ms) — matches the design brief. Fast feedback for taps,
// medium for progress/count-ups, slightly longer for reward moments.
export const Motion = {
  tap: 140,
  progress: 600,
  countUp: 700,
  reward: 320,
} as const;
