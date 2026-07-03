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

  it('rejects calories at or below 1400', () => {
    expect(validateMacroTargets({ ...base, calories: 1400 })).toMatch(/calorie/i);
  });

  it('rejects protein under 50g', () => {
    expect(validateMacroTargets({ ...base, protein: 40 })).toMatch(/protein/i);
  });

  it('rejects carbs outside the 25–65% energy window', () => {
    // 50 g carbs * 4 = 200 kcal of 2000 = 10% → too low.
    expect(validateMacroTargets({ ...base, carbs: 50 })).toMatch(/carb/i);
  });

  it('rejects non-finite numbers', () => {
    expect(validateMacroTargets({ ...base, calories: NaN })).toMatch(/valid number/i);
  });
});
