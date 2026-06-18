import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useDailyTotals } from '../../hooks/useDailyTotals';
import { deleteMeal, MealLog, MealType } from '../../services/mealLogService';
import { useMealLogger, MealLogFields } from '../../hooks/useMealLogger';
import { useMealEstimate } from '../../hooks/useMealEstimate';
import { MealEstimateCandidate } from '../../services/nutrition/types';
import { Colors, FontFamily } from '../../theme';

type EntryMode = 'manual' | 'describe';

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
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Refresh when the Log tab regains focus so edits/deletes made elsewhere,
  // or a fresh app session, always show the current persisted state.
  useFocusEffect(
    useCallback(() => {
      daily.refresh();
    }, [daily.refresh])
  );

  async function handleSubmit(): Promise<void> {
    const saved = await logger.submit();
    // Only reload totals/meals when the save actually succeeded, so a failed
    // save does not trigger a pointless refresh or mask the error banner.
    if (saved) {
      daily.refresh();
    }
  }

  function handleEdit(meal: MealLog): void {
    logger.beginEdit(meal);
  }

  function handleDelete(meal: MealLog): void {
    Alert.alert('Delete meal', `Remove "${meal.freeText}" from today?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(meal.id);
          try {
            await deleteMeal(meal.id);
            // If the row being edited was deleted, drop the stale edit session.
            if (logger.editingId === meal.id) {
              logger.cancelEdit();
            }
            daily.refresh();
          } catch (caughtError) {
            Alert.alert(
              'Could not delete',
              caughtError instanceof Error ? caughtError.message : 'Please try again.'
            );
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
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
              <TotalPill label="Unsat Fat" value={`${formatMacro(daily.totals.fatG)}g`} goal={formatGoal(daily.goals?.unsaturatedFatG, 'g')} />
              <TotalPill label="Trans Fat" value="—" goal={formatGoal(daily.goals?.transFatG, 'g')} />
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{logger.editingId ? 'EDIT MEAL' : 'ADD A MEAL'}</Text>

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
              {logger.isSubmitting
                ? 'SAVING...'
                : logger.editingId
                ? 'UPDATE MEAL'
                : 'SAVE MEAL'}
            </Text>
          </TouchableOpacity>

          {logger.editingId && !logger.isSubmitting && (
            <TouchableOpacity style={styles.cancelButton} onPress={logger.cancelEdit}>
              <Text style={styles.cancelButtonText}>CANCEL EDIT</Text>
            </TouchableOpacity>
          )}
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
            daily.meals.map((meal) => (
              <MealRow
                key={meal.id}
                meal={meal}
                isEditing={logger.editingId === meal.id}
                isDeleting={deletingId === meal.id}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))
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

function ModeButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.modeButton, active && styles.modeButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function DescribePanel({
  estimate,
  onUse,
}: {
  estimate: ReturnType<typeof useMealEstimate>;
  onUse: (candidate: MealEstimateCandidate) => void;
}) {
  return (
    <View>
      <Text style={styles.describeHint}>
        Describe your meal in plain words. We estimate the macros from USDA data — you confirm and
        edit before saving.
      </Text>

      <View style={styles.inputGroup}>
        <TextInput
          style={[styles.input, styles.describeInput]}
          placeholder="e.g. grilled chicken breast with broccoli"
          placeholderTextColor={Colors.textSecondary}
          value={estimate.query}
          onChangeText={estimate.setQuery}
          multiline
          onSubmitEditing={estimate.estimate}
        />
      </View>

      <TouchableOpacity
        style={[styles.submitButton, estimate.isEstimating && styles.submitButtonDisabled]}
        onPress={estimate.estimate}
        disabled={estimate.isEstimating}
      >
        <Text style={styles.submitButtonText}>
          {estimate.isEstimating ? 'ESTIMATING...' : 'ESTIMATE MACROS'}
        </Text>
      </TouchableOpacity>

      {estimate.error && (
        <View style={[styles.errorBanner, styles.describeSpacer]}>
          <Text style={styles.errorText}>{estimate.error}</Text>
        </View>
      )}

      {estimate.candidates.length > 0 && (
        <View style={styles.describeSpacer}>
          <Text style={styles.candidatesHeading}>
            {estimate.candidates.length} match{estimate.candidates.length === 1 ? '' : 'es'}
            {estimate.cached ? ' · cached' : ''}
          </Text>
          {estimate.candidates.map((candidate) => (
            <CandidateCard key={candidate.externalId} candidate={candidate} onUse={onUse} />
          ))}
        </View>
      )}
    </View>
  );
}

function CandidateCard({
  candidate,
  onUse,
}: {
  candidate: MealEstimateCandidate;
  onUse: (candidate: MealEstimateCandidate) => void;
}) {
  const { serving } = candidate;
  return (
    <View style={styles.candidateCard}>
      <View style={styles.candidateHeader}>
        <View style={styles.candidateTitleWrap}>
          <Text style={styles.candidateName} numberOfLines={2}>
            {candidate.name}
          </Text>
          <Text style={styles.candidateMeta} numberOfLines={1}>
            {[candidate.brandName, candidate.dataType, candidate.servingDescription]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <View style={styles.confidenceBadge}>
          <Text style={styles.confidenceText}>{Math.round(candidate.confidence * 100)}%</Text>
        </View>
      </View>

      <Text style={styles.candidateMacros}>
        {formatMacro(serving.calories)} cal · {formatMacro(serving.proteinG)}P ·{' '}
        {formatMacro(serving.carbsG)}C · {formatMacro(serving.fatG)}F
      </Text>

      <TouchableOpacity style={styles.useButton} onPress={() => onUse(candidate)}>
        <Text style={styles.useButtonText}>USE &amp; EDIT</Text>
      </TouchableOpacity>
    </View>
  );
}

function MealRow({
  meal,
  isEditing,
  isDeleting,
  onEdit,
  onDelete,
}: {
  meal: MealLog;
  isEditing: boolean;
  isDeleting: boolean;
  onEdit: (meal: MealLog) => void;
  onDelete: (meal: MealLog) => void;
}) {
  const calories = meal.calories * meal.quantity;
  const protein = meal.proteinG * meal.quantity;
  const carbs = meal.carbsG * meal.quantity;
  const fat = meal.fatG * meal.quantity;

  return (
    <View style={[styles.mealCard, isEditing && styles.mealCardEditing]}>
      <View style={styles.mealInfo}>
        <Text style={styles.mealName} numberOfLines={1}>{meal.freeText}</Text>
        <Text style={styles.mealMeta}>
          {formatMealTime(meal.eatenAt)} · {meal.mealType} · qty {formatMacro(meal.quantity)}
        </Text>
        <View style={styles.mealActions}>
          <TouchableOpacity
            style={styles.mealActionButton}
            onPress={() => onEdit(meal)}
            disabled={isDeleting}
          >
            <Text style={styles.mealActionText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mealActionButton}
            onPress={() => onDelete(meal)}
            disabled={isDeleting}
          >
            <Text style={[styles.mealActionText, styles.mealActionDelete]}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Text>
          </TouchableOpacity>
        </View>
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
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  modeButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeButtonActive: { backgroundColor: Colors.primary + '14', borderColor: Colors.primary + '44' },
  modeButtonText: { fontFamily: FontFamily.bodyMedium, fontSize: 13, color: Colors.textSecondary },
  modeButtonTextActive: { color: Colors.primary },
  describeHint: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 17,
  },
  describeInput: { minHeight: 60, textAlignVertical: 'top' },
  describeSpacer: { marginTop: 12 },
  candidatesHeading: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  candidateCard: {
    backgroundColor: Colors.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    marginBottom: 8,
  },
  candidateHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  candidateTitleWrap: { flex: 1, marginRight: 8 },
  candidateName: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.textPrimary },
  candidateMeta: { fontFamily: FontFamily.body, fontSize: 11, color: Colors.textSecondary, marginTop: 3 },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Colors.primary + '14',
    borderWidth: 1,
    borderColor: Colors.primary + '44',
  },
  confidenceText: { fontFamily: FontFamily.bodyMedium, fontSize: 11, color: Colors.primary },
  candidateMacros: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  useButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 50,
    backgroundColor: Colors.primary,
  },
  useButtonText: { fontFamily: FontFamily.displayBold, fontSize: 12, color: Colors.background },
  estimateBanner: {
    backgroundColor: Colors.primary + '12',
    borderColor: Colors.primary + '44',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  estimateBannerText: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.textPrimary },
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
  cancelButton: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 50,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelButtonText: { fontFamily: FontFamily.bodyMedium, fontSize: 13, color: Colors.textSecondary },
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
  mealCardEditing: { borderColor: Colors.primary + '88' },
  mealInfo: { flex: 1, marginRight: 8 },
  mealName: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.textPrimary },
  mealMeta: { fontFamily: FontFamily.body, fontSize: 11, color: Colors.textSecondary, marginTop: 3 },
  mealActions: { flexDirection: 'row', gap: 14, marginTop: 8 },
  mealActionButton: { paddingVertical: 2 },
  mealActionText: { fontFamily: FontFamily.bodyMedium, fontSize: 12, color: Colors.primary },
  mealActionDelete: { color: Colors.error },
  mealMacros: { alignItems: 'flex-end' },
  mealCalories: { fontFamily: FontFamily.displayBold, fontSize: 15, color: Colors.textPrimary },
  mealMacroDetail: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
