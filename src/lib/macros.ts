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
 * Light sanity check on macro targets. Deliberately does NOT hard-reject diet
 * styles: the old carb% / fat% cross-field rules made keto, low-fat and very
 * high-carb goals impossible and mismatched the DB. We only guard against
 * genuinely broken input (non-numeric, negative, or an unsafe-low calorie
 * floor). The relaxed DB constraints live in migration 0015. Returns an error
 * string to show the user, or null when the targets are acceptable.
 */
export function validateMacroTargets(targets: MacroTargets): string | null {
  const { calories, protein, carbs, fats } = targets;
  if (![calories, protein, carbs, fats].every(Number.isFinite)) {
    return 'All macro targets must be valid numbers.';
  }
  if (protein < 0 || carbs < 0 || fats < 0) {
    return 'Macro targets can’t be negative.';
  }
  // The only remaining calorie floor is a safety rail (also enforced by the DB
  // constraint profiles_goal_calories_min: goal_calories > 1400).
  if (calories <= 1400) {
    return 'Your calorie target must be at least 1,500 kcal.';
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
