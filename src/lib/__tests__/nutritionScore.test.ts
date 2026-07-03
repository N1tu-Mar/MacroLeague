import { computeNutritionScore } from '../nutritionScore';

const goals = { calories: 2000, proteinG: 150, carbsG: 200 };

describe('computeNutritionScore', () => {
  it('is 0 with a prompt when nothing is logged', () => {
    const result = computeNutritionScore({ calories: 0, proteinG: 0, carbsG: 0 }, goals);
    expect(result.score).toBe(0);
    expect(result.status).toMatch(/log a meal/i);
  });

  it('is 0 (not a crash) when there are no goals', () => {
    const result = computeNutritionScore({ calories: 1000, proteinG: 80, carbsG: 100 }, null);
    expect(result.score).toBe(0);
  });

  it('scores a perfectly-on-target day at 100', () => {
    const result = computeNutritionScore({ ...goals }, goals);
    expect(result.score).toBe(100);
    expect(result.status).toMatch(/strong/i);
  });

  it('penalizes going far over target symmetrically', () => {
    // Double every macro → each adherence 0 → score 0.
    const result = computeNutritionScore(
      { calories: 4000, proteinG: 300, carbsG: 400 },
      goals,
    );
    expect(result.score).toBe(0);
  });

  it('skips unset goals rather than counting them as zero', () => {
    // Only protein goal set; hit it exactly → full score off that one axis.
    const partialGoals = { calories: 0, proteinG: 150, carbsG: 0 };
    const result = computeNutritionScore({ calories: 0, proteinG: 150, carbsG: 0 }, partialGoals);
    expect(result.score).toBe(100);
  });
});
