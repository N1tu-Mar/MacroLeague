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
