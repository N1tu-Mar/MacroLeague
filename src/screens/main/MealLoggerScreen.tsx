import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useDailyTotals } from '../../hooks/useDailyTotals';
import { MealLog, MealType } from '../../services/mealLogService';
import { useMealLogger, MealLogFields } from '../../hooks/useMealLogger';
import { Colors, FontFamily } from '../../theme';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

type FieldConfig = {
  key: keyof MealLogFields;
  label: string;
  placeholder: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
};

const FIELD_CONFIGS: FieldConfig[] = [
  { key: 'freeText', label: 'Food name', placeholder: 'Chicken rice bowl' },
  { key: 'calories', label: 'Calories', placeholder: '520', keyboardType: 'decimal-pad' },
  { key: 'proteinG', label: 'Protein', placeholder: '38', keyboardType: 'decimal-pad' },
  { key: 'carbsG', label: 'Carbs', placeholder: '62', keyboardType: 'decimal-pad' },
  { key: 'fatG', label: 'Fat', placeholder: '14', keyboardType: 'decimal-pad' },
  { key: 'quantity', label: 'Quantity', placeholder: '1', keyboardType: 'decimal-pad' },
];

function formatMacro(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatGoal(value: number | null | undefined, unit: string): string {
  return value === null || value === undefined ? 'No goal' : `${value}${unit}`;
}

function formatMealTime(eatenAt: string): string {
  return new Date(eatenAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function MealLoggerScreen() {
  const today = useMemo(() => new Date(), []);
  const logger = useMealLogger();
  const daily = useDailyTotals(today);

  async function handleSubmit(): Promise<void> {
    await logger.submit();
    daily.refresh();
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>LOG A MEAL</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>TODAY</Text>
            <TouchableOpacity style={styles.refreshButton} onPress={daily.refresh}>
              <Text style={styles.refreshText}>Refresh</Text>
            </TouchableOpacity>
          </View>

          {daily.error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{daily.error.message}</Text>
            </View>
          )}

          {daily.isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : (
            <View style={styles.totalsGrid}>
              <TotalPill label="Cal" value={formatMacro(daily.totals.calories)} goal={formatGoal(daily.goals?.calories, '')} />
              <TotalPill label="Protein" value={`${formatMacro(daily.totals.proteinG)}g`} goal={formatGoal(daily.goals?.proteinG, 'g')} />
              <TotalPill label="Carbs" value={`${formatMacro(daily.totals.carbsG)}g`} goal={formatGoal(daily.goals?.carbsG, 'g')} />
              <TotalPill label="Fat" value={`${formatMacro(daily.totals.fatG)}g`} goal={formatGoal(daily.goals?.fatG, 'g')} />
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MANUAL ENTRY</Text>

          {FIELD_CONFIGS.map((field) => (
            <View key={field.key} style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{field.label}</Text>
              <TextInput
                style={styles.input}
                placeholder={field.placeholder}
                placeholderTextColor={Colors.textSecondary}
                value={logger.fields[field.key]}
                onChangeText={(value) => logger.setField(field.key, value)}
                keyboardType={field.keyboardType ?? 'default'}
              />
            </View>
          ))}

          <View style={styles.mealTypeRow}>
            {MEAL_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.mealTypeButton, logger.mealType === type && styles.mealTypeButtonActive]}
                onPress={() => logger.setMealType(type)}
              >
                <Text
                  style={[styles.mealTypeText, logger.mealType === type && styles.mealTypeTextActive]}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {logger.error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{logger.error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitButton, logger.isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={logger.isSubmitting}
          >
            <Text style={styles.submitButtonText}>
              {logger.isSubmitting ? 'SAVING...' : 'SAVE MEAL'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CONFIRMED MEALS</Text>
          {daily.isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : daily.meals.length === 0 ? (
            <Text style={styles.emptyText}>No meals logged yet.</Text>
          ) : (
            daily.meals.map((meal) => <MealRow key={meal.id} meal={meal} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function TotalPill({ label, value, goal }: { label: string; value: string; goal: string }) {
  return (
    <View style={styles.totalPill}>
      <Text style={styles.totalValue}>{value}</Text>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={styles.totalGoal}>{goal}</Text>
    </View>
  );
}

function MealRow({ meal }: { meal: MealLog }) {
  const calories = meal.calories * meal.quantity;
  const protein = meal.proteinG * meal.quantity;
  const carbs = meal.carbsG * meal.quantity;
  const fat = meal.fatG * meal.quantity;

  return (
    <View style={styles.mealCard}>
      <View style={styles.mealInfo}>
        <Text style={styles.mealName} numberOfLines={1}>{meal.freeText}</Text>
        <Text style={styles.mealMeta}>
          {formatMealTime(meal.eatenAt)} · {meal.mealType} · qty {formatMacro(meal.quantity)}
        </Text>
      </View>
      <View style={styles.mealMacros}>
        <Text style={styles.mealCalories}>{formatMacro(calories)} cal</Text>
        <Text style={styles.mealMacroDetail}>
          {formatMacro(protein)}P · {formatMacro(carbs)}C · {formatMacro(fat)}F
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12 },
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: 24,
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  content: { flex: 1 },
  contentInner: { padding: 16, paddingBottom: 32 },
  section: {
    marginBottom: 18,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: 18,
    color: Colors.textPrimary,
    letterSpacing: 1,
    marginBottom: 12,
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary + '44',
    backgroundColor: Colors.primary + '12',
  },
  refreshText: { fontFamily: FontFamily.bodyMedium, fontSize: 12, color: Colors.primary },
  totalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  totalPill: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: Colors.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
  },
  totalValue: { fontFamily: FontFamily.displayBold, fontSize: 22, color: Colors.primary },
  totalLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  totalGoal: { fontFamily: FontFamily.body, fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  inputGroup: { marginBottom: 12 },
  inputLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  mealTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  mealTypeButton: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  mealTypeButtonActive: { backgroundColor: Colors.primary + '14', borderColor: Colors.primary + '44' },
  mealTypeText: { fontFamily: FontFamily.bodyMedium, fontSize: 12, color: Colors.textSecondary },
  mealTypeTextActive: { color: Colors.primary },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 50,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { fontFamily: FontFamily.displayBold, fontSize: 15, color: Colors.background },
  loadingBox: { paddingVertical: 22, alignItems: 'center' },
  errorBanner: {
    backgroundColor: Colors.error + '16',
    borderColor: Colors.error + '55',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  errorText: { fontFamily: FontFamily.bodyMedium, fontSize: 12, color: Colors.error },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 20,
  },
  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    marginBottom: 8,
  },
  mealInfo: { flex: 1, marginRight: 8 },
  mealName: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.textPrimary },
  mealMeta: { fontFamily: FontFamily.body, fontSize: 11, color: Colors.textSecondary, marginTop: 3 },
  mealMacros: { alignItems: 'flex-end' },
  mealCalories: { fontFamily: FontFamily.displayBold, fontSize: 15, color: Colors.textPrimary },
  mealMacroDetail: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
