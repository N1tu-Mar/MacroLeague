import React from 'react';
import { FoodLogItem, Colors } from 'macroleague';

const Stack = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 360, background: Colors.background, padding: 16, borderRadius: 12 }}>
    {children}
  </div>
);

// eatenAt anchored to "today at HH:MM" so the time reads plausibly under both
// the frozen capture clock and a real clock.
const todayAt = (h: number, m: number) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const baseMeal = {
  id: 'meal-1',
  userId: 'user-1',
  foodId: null,
  freeText: 'Grilled Chicken Bowl',
  calories: 520,
  proteinG: 42,
  carbsG: 48,
  fatG: 16,
  quantity: 1,
  mealType: 'lunch' as const,
  eatenAt: todayAt(12, 40),
  clientRequestId: 'req-1',
  createdAt: todayAt(12, 41),
  updatedAt: todayAt(12, 41),
  source: 'user_estimate' as const,
  sourceFoodId: null,
  confidence: 0.86,
  saturatedFatG: null,
  transFatG: null,
  unsaturatedFatG: null,
  fiberG: 6,
  sodiumMg: 780,
};

export const LunchEstimate = () => (
  <Stack>
    <FoodLogItem meal={baseMeal} />
  </Stack>
);

export const BreakfastManual = () => (
  <Stack>
    <FoodLogItem
      meal={{
        ...baseMeal,
        id: 'meal-2',
        freeText: 'Egg White Omelet + Oatmeal',
        calories: 410,
        proteinG: 31.5,
        carbsG: 44,
        fatG: 9.5,
        mealType: 'breakfast',
        eatenAt: todayAt(8, 15),
        source: 'manual',
        confidence: null,
        fiberG: null,
        sodiumMg: null,
      }}
    />
  </Stack>
);

export const SnackDoubleServing = () => (
  <Stack>
    <FoodLogItem
      meal={{
        ...baseMeal,
        id: 'meal-3',
        freeText: 'Greek Yogurt Parfait',
        calories: 180,
        proteinG: 14,
        carbsG: 22,
        fatG: 4,
        quantity: 2,
        mealType: 'snack',
        eatenAt: todayAt(15, 5),
        source: 'usda_fdc',
        sourceFoodId: 'fdc-171284',
      }}
    />
  </Stack>
);

export const DinnerLegacyRow = () => (
  <Stack>
    <FoodLogItem
      meal={{
        ...baseMeal,
        id: 'meal-4',
        freeText: 'Busch Dining Hall Salmon + Rice Pilaf with Roasted Veggies',
        calories: 640,
        proteinG: 38,
        carbsG: 58,
        fatG: 24,
        mealType: 'dinner',
        eatenAt: todayAt(18, 45),
        source: null,
        confidence: null,
        fiberG: null,
        sodiumMg: null,
      }}
    />
  </Stack>
);
