import { calculateMacros, validateMacroTargets, GoalType } from '../macros';

describe('calculateMacros', () => {
  const goals: GoalType[] = ['muscle', 'lose_weight', 'eat_cleaner', 'just_track'];

  it('returns valid, self-consistent targets for every goal', () => {
    for (const goal of goals) {
      const targets = calculateMacros(goal);
      // Every suggested preset must itself pass validation.
      expect(validateMacroTargets(targets)).toBeNull();
    }
  });

  it('gives muscle-building the highest protein', () => {
    const muscle = calculateMacros('muscle');
    const track = calculateMacros('just_track');
    expect(muscle.protein).toBeGreaterThan(track.protein);
  });
});

describe('validateMacroTargets', () => {
  const base = { calories: 2000, protein: 130, carbs: 200, fats: 65 };

  it('accepts a well-formed target', () => {
    expect(validateMacroTargets(base)).toBeNull();
  });

  // Diet styles are no longer hard-blocked (the app nudges, it doesn't forbid):
  it('accepts a low-carb / keto split', () => {
    // 30 g carbs * 4 = 120 kcal of 2000 = 6% — allowed now.
    expect(validateMacroTargets({ ...base, carbs: 30, fats: 150 })).toBeNull();
  });

  it('accepts a very high-carb split', () => {
    expect(validateMacroTargets({ ...base, carbs: 400, fats: 20 })).toBeNull();
  });

  it('accepts a low-fat split', () => {
    expect(validateMacroTargets({ ...base, fats: 15 })).toBeNull();
  });

  it('accepts protein under 50g', () => {
    expect(validateMacroTargets({ ...base, protein: 40 })).toBeNull();
  });

  it('rejects an unsafely low calorie floor', () => {
    expect(validateMacroTargets({ ...base, calories: 500 })).toMatch(/calorie/i);
  });

  it('rejects negative macros', () => {
    expect(validateMacroTargets({ ...base, carbs: -10 })).toMatch(/negative/i);
  });

  it('rejects non-finite numbers', () => {
    expect(validateMacroTargets({ ...base, calories: NaN })).toMatch(/valid number/i);
  });
});
