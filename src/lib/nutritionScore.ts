// A single 0–100 "how good was today" score, derived from REAL goal adherence
// (today's logged macros vs. the user's profile goals). Replaces the former mocked
// NUTRITION_TODAY constant. Pure + side-effect free so it's easy to test and reuse.

export interface ScoreInputs {
  calories: number;
  proteinG: number;
  carbsG: number;
}

export interface NutritionScore {
  /** 0–100. 0 when there are no goals or nothing logged. */
  score: number;
  status: string;
}

// How close `actual` is to `goal`, as 0..1. Under-target scales linearly; going
// over is penalized symmetrically (so massively overeating doesn't read as perfect).
function adherence(actual: number, goal: number): number | null {
  if (!goal || goal <= 0) return null;
  const ratio = actual / goal;
  if (ratio <= 1) return Math.max(0, ratio);
  return Math.max(0, 2 - ratio); // 110% -> 0.9, 150% -> 0.5, 200%+ -> 0
}

function statusFor(score: number, anyLogged: boolean): string {
  if (!anyLogged) return 'Log a meal to start';
  if (score >= 80) return 'Strong day';
  if (score >= 60) return 'Solid progress';
  if (score >= 40) return 'Getting there';
  return 'Just getting started';
}

/**
 * Averages calorie/protein/carb adherence into a 0–100 score. Goals that are unset
 * are skipped (not counted as zero), so a partial goal setup still scores fairly.
 */
export function computeNutritionScore(totals: ScoreInputs, goals: ScoreInputs | null): NutritionScore {
  const anyLogged = totals.calories > 0 || totals.proteinG > 0 || totals.carbsG > 0;
  if (!goals) return { score: 0, status: statusFor(0, anyLogged) };

  const parts = [
    adherence(totals.calories, goals.calories),
    adherence(totals.proteinG, goals.proteinG),
    adherence(totals.carbsG, goals.carbsG),
  ].filter((v): v is number => v !== null);

  if (parts.length === 0) return { score: 0, status: statusFor(0, anyLogged) };

  const score = Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100);
  return { score, status: statusFor(score, anyLogged) };
}
