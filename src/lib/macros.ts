// Macro-target math used during onboarding. This is deterministic business logic
// (not mock data): it suggests starting daily targets for a chosen goal, which the
// user then fine-tunes and which is persisted to the real profiles row.

export type GoalType = 'muscle' | 'lose_weight' | 'eat_cleaner' | 'just_track';

export interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  /** Maps to the profile's unsaturated-fat goal at save time. */
  fats: number;
}

/**
 * Mirrors the profile goal constraints so onboarding can explain an invalid
 * combination before Supabase rejects the save with a database error.
 */
export function validateMacroTargets(targets: MacroTargets): string | null {
  const { calories, protein, carbs, fats } = targets;
  if (![calories, protein, carbs, fats].every(Number.isFinite)) {
    return 'All macro targets must be valid numbers.';
  }
  if (calories <= 1400) return 'Your calorie target must be at least 1,500 kcal.';
  if (protein < 50) return 'Your protein target must be at least 50g.';

  const carbShare = (carbs * 4) / calories;
  if (carbShare < 0.25 || carbShare > 0.65) {
    return 'Carbs must provide between 25% and 65% of your calorie target.';
  }
  if (fats * 9 < calories * 0.1) {
    return 'Your unsaturated fat target must provide at least 10% of your calorie target.';
  }
  return null;
}

/** Suggested starting macro targets for a goal. */
export function calculateMacros(goalType: GoalType): MacroTargets {
  switch (goalType) {
    case 'muscle':
      return { calories: 2800, protein: 200, carbs: 280, fats: 90 };
    case 'lose_weight':
      return { calories: 1800, protein: 160, carbs: 160, fats: 60 };
    case 'eat_cleaner':
      return { calories: 2200, protein: 150, carbs: 220, fats: 70 };
    case 'just_track':
    default:
      return { calories: 2000, protein: 130, carbs: 200, fats: 65 };
  }
}
