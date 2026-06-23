import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontFamily } from '../theme';
// Renders the REAL Supabase meal row (mealLogService.MealLog), not the demo
// `../types` MealLog. Macros are per-serving, so each is multiplied by quantity
// for display — matching how daily totals are summed.
import { MealLog } from '../services/mealLogService';

interface FoodLogItemProps {
  meal: MealLog;
}

// Provenance badge. A null source is a legacy row → treated/labeled as manual.
const SOURCE_ICONS: Record<string, string> = {
  user_estimate: '✨',
  usda_fdc: '🔍',
  manual: '✏️',
};

const MEAL_ICONS: Record<string, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍎',
};

function formatMacro(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function sourceKey(source: MealLog['source']): string {
  // NULL/legacy collapses to 'manual' so old logs render consistently.
  return source ?? 'manual';
}

function sourceLabel(source: MealLog['source']): string {
  if (source === 'user_estimate') return 'estimate';
  if (source === 'usda_fdc') return 'USDA';
  return 'manual';
}

export default function FoodLogItem({ meal }: FoodLogItemProps) {
  const time = new Date(meal.eatenAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  // Apply quantity so the card matches the contribution to daily totals.
  const calories = meal.calories * meal.quantity;
  const protein = meal.proteinG * meal.quantity;
  const carbs = meal.carbsG * meal.quantity;
  const fat = meal.fatG * meal.quantity;

  return (
    <View style={styles.container}>
      <View style={styles.iconCol}>
        <Text style={styles.mealIcon}>{MEAL_ICONS[meal.mealType] ?? '🍽️'}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{meal.freeText}</Text>
        <Text style={styles.meta}>
          {time} · {SOURCE_ICONS[sourceKey(meal.source)] ?? ''} {sourceLabel(meal.source)}
        </Text>
      </View>
      <View style={styles.macros}>
        <Text style={styles.cal}>{formatMacro(calories)} cal</Text>
        <Text style={styles.macroDetail}>
          {formatMacro(protein)}P · {formatMacro(carbs)}C · {formatMacro(fat)}F
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconCol: { width: 36, alignItems: 'center' },
  mealIcon: { fontSize: 22 },
  info: { flex: 1, marginLeft: 8 },
  name: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.textPrimary },
  meta: { fontFamily: FontFamily.body, fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  macros: { alignItems: 'flex-end' },
  cal: { fontFamily: FontFamily.displayBold, fontSize: 15, color: Colors.textPrimary },
  macroDetail: { fontFamily: FontFamily.body, fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
});
