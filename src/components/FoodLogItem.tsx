import React from 'react';
import { View } from 'react-native';
import { FontFamily, useTheme } from '../theme';
// Renders the REAL Supabase meal row (mealLogService.MealLog), not the demo
// `../types` MealLog. Macros are per-serving, so each is multiplied by quantity
// for display — matching how daily totals are summed.
import { MealLog } from '../services/mealLogService';
import { Text, AppIcon, Badge } from './ui';
import { AppIconName } from './ui/AppIcon';

interface FoodLogItemProps {
  meal: MealLog;
  showDivider?: boolean;
}

const MEAL_ICONS: Record<string, AppIconName> = {
  breakfast: 'sunrise',
  lunch: 'salad',
  dinner: 'moon',
  snack: 'apple',
};

// Per-meal-type tile tints (design meal-icon tints).
const MEAL_TINT: Record<string, { bg: string; fg: string }> = {
  breakfast: { bg: '#F3E4D2', fg: '#A0642A' },
  lunch: { bg: '#E2EDD9', fg: '#5A7A3A' },
  dinner: { bg: '#E3E8F2', fg: '#4A6288' },
  snack: { bg: '#F3E4D2', fg: '#A0642A' },
};

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(0);
}

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export default function FoodLogItem({ meal, showDivider = true }: FoodLogItemProps) {
  const { colors } = useTheme();
  const time = new Date(meal.eatenAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const calories = meal.calories * meal.quantity;
  const protein = meal.proteinG * meal.quantity;
  const tint = MEAL_TINT[meal.mealType] ?? MEAL_TINT.snack;
  const isUsda = meal.source === 'usda_fdc';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderTopWidth: showDivider ? 1 : 0,
        borderTopColor: colors.rowDivider,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: tint.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppIcon name={MEAL_ICONS[meal.mealType] ?? 'meal'} size={21} color={tint.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="cardTitle" color={colors.ink} numberOfLines={1} style={{ flexShrink: 1 }}>
            {meal.freeText}
          </Text>
          {isUsda ? <Badge label="USDA" tone="usda" /> : null}
        </View>
        <Text variant="labelSm" color={colors.textSecondary} style={{ marginTop: 1 }}>
          {MEAL_LABEL[meal.mealType] ?? 'Meal'} · {time}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontFamily: FontFamily.numBold, fontSize: 15, color: colors.ink }}>
          {fmt(calories)} <Text style={{ fontFamily: FontFamily.semibold, fontSize: 10.5, color: colors.textTertiary }}>kcal</Text>
        </Text>
        <Text variant="labelSm" color={colors.textSecondary}>{fmt(protein)}g protein</Text>
      </View>
    </View>
  );
}
