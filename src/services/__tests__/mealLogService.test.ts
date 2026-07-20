// `mealLogService` constructs the Supabase client at import time (and throws if
// the env vars are absent), so the module is stubbed out. Every function under
// test here is pure and never touches the client.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
// monitoring pulls in @sentry/react-native (ESM, untransformed by babel-jest);
// the pure functions under test never report, so stub it out.
jest.mock('../../lib/monitoring', () => ({ reportError: jest.fn() }));

import { sumMealTotals, type MealLog } from '../mealLogService';

/**
 * Builds a MealLog with sane defaults so each test only states the fields it
 * actually cares about. Subtypes default to null ("unknown"), which is the
 * legacy-row shape and the case most likely to regress.
 */
function meal(overrides: Partial<MealLog> = {}): MealLog {
  return {
    id: 'meal-1',
    userId: 'user-1',
    foodId: null,
    freeText: 'test meal',
    calories: 100,
    proteinG: 10,
    carbsG: 20,
    fatG: 5,
    quantity: 1,
    mealType: 'lunch',
    eatenAt: '2026-07-20T12:00:00.000Z',
    clientRequestId: 'req-1',
    createdAt: '2026-07-20T12:00:00.000Z',
    updatedAt: '2026-07-20T12:00:00.000Z',
    source: 'manual',
    sourceFoodId: null,
    confidence: null,
    saturatedFatG: null,
    transFatG: null,
    unsaturatedFatG: null,
    fiberG: null,
    sodiumMg: null,
    userConfirmedAt: null,
    ...overrides,
  };
}

describe('sumMealTotals', () => {
  it('returns zeroed totals for an empty day', () => {
    const totals = sumMealTotals([]);

    expect(totals.calories).toBe(0);
    expect(totals.proteinG).toBe(0);
    expect(totals.carbsG).toBe(0);
    expect(totals.fatG).toBe(0);
    expect(totals.mealCount).toBe(0);
    expect(totals.saturatedFat).toEqual({ grams: 0, knownCount: 0, missingCount: 0 });
    expect(totals.transFat).toEqual({ grams: 0, knownCount: 0, missingCount: 0 });
    expect(totals.unsaturatedFat).toEqual({ grams: 0, knownCount: 0, missingCount: 0 });
  });

  it('does not share mutable subtype state between calls', () => {
    // ZERO_TOTALS is a module-level constant; if the reducer ever mutated its
    // seed instead of rebuilding it, totals would leak across days.
    const first = sumMealTotals([meal({ saturatedFatG: 3 })]);
    const second = sumMealTotals([]);

    expect(first.saturatedFat.grams).toBe(3);
    expect(second.saturatedFat.grams).toBe(0);
    expect(second.saturatedFat.knownCount).toBe(0);
  });

  it('sums macros across several meals', () => {
    const totals = sumMealTotals([
      meal({ calories: 100, proteinG: 10, carbsG: 20, fatG: 5 }),
      meal({ calories: 250, proteinG: 30, carbsG: 15, fatG: 8 }),
    ]);

    expect(totals.calories).toBe(350);
    expect(totals.proteinG).toBe(40);
    expect(totals.carbsG).toBe(35);
    expect(totals.fatG).toBe(13);
    expect(totals.mealCount).toBe(2);
  });

  it('applies quantity to every macro', () => {
    const totals = sumMealTotals([
      meal({ calories: 100, proteinG: 10, carbsG: 20, fatG: 5, quantity: 3 }),
    ]);

    expect(totals.calories).toBe(300);
    expect(totals.proteinG).toBe(30);
    expect(totals.carbsG).toBe(60);
    expect(totals.fatG).toBe(15);
    // Quantity scales macros but a multi-serving log is still ONE meal.
    expect(totals.mealCount).toBe(1);
  });

  it('supports fractional quantities', () => {
    const totals = sumMealTotals([
      meal({ calories: 300, proteinG: 21, carbsG: 10, fatG: 4, quantity: 0.5 }),
    ]);

    expect(totals.calories).toBe(150);
    expect(totals.proteinG).toBe(10.5);
    expect(totals.carbsG).toBe(5);
    expect(totals.fatG).toBe(2);
  });

  it('scales known fat subtypes by quantity and counts coverage', () => {
    const totals = sumMealTotals([
      meal({ saturatedFatG: 2, transFatG: 1, unsaturatedFatG: 4, quantity: 2 }),
    ]);

    expect(totals.saturatedFat).toEqual({ grams: 4, knownCount: 1, missingCount: 0 });
    expect(totals.transFat).toEqual({ grams: 2, knownCount: 1, missingCount: 0 });
    expect(totals.unsaturatedFat).toEqual({ grams: 8, knownCount: 1, missingCount: 0 });
  });

  it('never coerces an unknown subtype to zero — it counts it as missing', () => {
    // The whole point of FatSubtypeTotal: a null subtype must degrade coverage,
    // not silently understate the day's saturated fat as if it were 0g.
    const totals = sumMealTotals([
      meal({ saturatedFatG: 6 }),
      meal({ saturatedFatG: null }),
    ]);

    expect(totals.saturatedFat.grams).toBe(6);
    expect(totals.saturatedFat.knownCount).toBe(1);
    expect(totals.saturatedFat.missingCount).toBe(1);
  });

  it('tracks each subtype’s coverage independently', () => {
    const totals = sumMealTotals([
      meal({ saturatedFatG: 3, transFatG: null, unsaturatedFatG: 5 }),
      meal({ saturatedFatG: null, transFatG: 2, unsaturatedFatG: 1 }),
    ]);

    expect(totals.saturatedFat).toEqual({ grams: 3, knownCount: 1, missingCount: 1 });
    expect(totals.transFat).toEqual({ grams: 2, knownCount: 1, missingCount: 1 });
    expect(totals.unsaturatedFat).toEqual({ grams: 6, knownCount: 2, missingCount: 0 });
  });

  it('treats a known 0g subtype as known, not missing', () => {
    // 0g saturated fat is a real, reportable value — distinct from "unknown".
    const totals = sumMealTotals([meal({ saturatedFatG: 0 })]);

    expect(totals.saturatedFat).toEqual({ grams: 0, knownCount: 1, missingCount: 0 });
  });

  it('keeps total fat authoritative and independent of subtype coverage', () => {
    // fatG is ALWAYS total fat; subtypes are supplementary and may not sum to it.
    const totals = sumMealTotals([
      meal({ fatG: 10, saturatedFatG: 2, transFatG: null, unsaturatedFatG: null }),
    ]);

    expect(totals.fatG).toBe(10);
    expect(totals.saturatedFat.grams).toBe(2);
  });
});
