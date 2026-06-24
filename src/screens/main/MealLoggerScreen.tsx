import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useDailyTotals } from '../../hooks/useDailyTotals';
import { FatSubtypeTotal, MealLog, MealType } from '../../services/mealLogService';
import { useMealLogger, MealLogFields } from '../../hooks/useMealLogger';
import { useMealEstimate } from '../../hooks/useMealEstimate';
import { MealEstimateCandidate } from '../../services/nutrition/types';
import { useUserStore } from '../../store/userStore';
import { BASE_MEAL_XP, BASE_MEAL_POINTS } from '../../services/gamificationService';
import FloatingXP from '../../components/FloatingXP';
import { Colors, FontFamily } from '../../theme';

type EntryMode = 'manual' | 'describe';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

type FieldConfig = {
  key: keyof MealLogFields;
  label: string;
  placeholder: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
};

// Required fields, in display order. `fatG` is TOTAL fat.
const FIELD_CONFIGS: FieldConfig[] = [
  { key: 'freeText', label: 'Food name', placeholder: 'Chicken rice bowl' },
  { key: 'calories', label: 'Calories', placeholder: '520', keyboardType: 'decimal-pad' },
  { key: 'proteinG', label: 'Protein', placeholder: '38', keyboardType: 'decimal-pad' },
  { key: 'carbsG', label: 'Carbs', placeholder: '62', keyboardType: 'decimal-pad' },
  { key: 'fatG', label: 'Total fat', placeholder: '14', keyboardType: 'decimal-pad' },
  { key: 'quantity', label: 'Quantity', placeholder: '1', keyboardType: 'decimal-pad' },
];

// Optional fat breakdown. Blank saves as NULL ("unknown"), never 0. An applied
// USDA estimate pre-fills these; a pure manual entry can leave them empty.
const OPTIONAL_FAT_CONFIGS: FieldConfig[] = [
  { key: 'saturatedFatG', label: 'Saturated fat', placeholder: 'optional', keyboardType: 'decimal-pad' },
  { key: 'transFatG', label: 'Trans fat', placeholder: 'optional', keyboardType: 'decimal-pad' },
  { key: 'unsaturatedFatG', label: 'Unsaturated fat', placeholder: 'optional', keyboardType: 'decimal-pad' },
];

function formatMacro(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatGoal(value: number | null | undefined, unit: string): string {
  return value === null || value === undefined ? 'No goal' : `${value}${unit}`;
}

/**
 * Honest display for a fat subtype total. Shows "Not available" when no meal in
 * the day reported the value (instead of a misleading 0), and flags a partial
 * day where only some meals had the breakdown.
 */
function formatSubtype(total: FatSubtypeTotal): string {
  if (total.knownCount === 0) {
    return 'Not available';
  }
  const grams = `${formatMacro(total.grams)}g`;
  return total.missingCount > 0 ? `${grams} (partial)` : grams;
}

function formatMealTime(eatenAt: string): string {
  return new Date(eatenAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function MealLoggerScreen() {
  const today = useMemo(() => new Date(), []);
  const logger = useMealLogger();
  const estimate = useMealEstimate();
  const daily = useDailyTotals(today);
  const refreshStats = useUserStore((s) => s.refreshStats);
  const [entryMode, setEntryMode] = useState<EntryMode>('manual');
  // Post-log feedback: the floating "+XP" animation and a short-lived toast.
  const [showXp, setShowXp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  async function handleSubmit(): Promise<void> {
    const result = await logger.submit();
    daily.refresh();
    if (!result.logged) {
      return;
    }

    // Optimistic, immediate feedback from the known base award (mirrors the DB
    // trigger constants). The authoritative totals are pulled right after.
    setShowXp(true);
    setToast(`+${BASE_MEAL_XP} XP · +${BASE_MEAL_POINTS} pts`);

    await refreshStats();
    const streak = useUserStore.getState().user?.streakCount ?? 0;
    if (streak > 0) {
      setToast(`+${BASE_MEAL_XP} XP · +${BASE_MEAL_POINTS} pts · 🔥 ${streak}-day streak`);
    }

    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  function handleUseCandidate(candidate: MealEstimateCandidate): void {
    logger.applyEstimate(candidate);
    setEntryMode('manual');
  }

  // Editing happens in the manual form, so switch modes when an edit starts.
  function handleBeginEdit(meal: MealLog): void {
    logger.beginEdit(meal);
    setEntryMode('manual');
  }

  function handleDelete(meal: MealLog): void {
    Alert.alert(
      'Delete meal?',
      `Remove "${meal.freeText}" from your log? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const ok = await logger.removeMeal(meal.id);
            if (ok) {
              daily.refresh();
            }
          },
        },
      ],
    );
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
              {/* Total fat is labeled as TOTAL fat — not unsaturated. No total-fat
                  goal exists in the schema, so the goal line stays empty here. */}
              <TotalPill label="Total Fat" value={`${formatMacro(daily.totals.fatG)}g`} goal="" />
              {/* Subtypes are coverage-aware: "Not available" until a meal reports them. */}
              <TotalPill label="Unsat Fat" value={formatSubtype(daily.totals.unsaturatedFat)} goal={formatGoal(daily.goals?.unsaturatedFatG, 'g')} />
              <TotalPill label="Sat Fat" value={formatSubtype(daily.totals.saturatedFat)} goal="" />
              <TotalPill label="Trans Fat" value={formatSubtype(daily.totals.transFat)} goal={formatGoal(daily.goals?.transFatG, 'g')} />
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{logger.editingId ? 'EDIT MEAL' : 'ADD A MEAL'}</Text>

          {/* The Manual/Describe toggle is hidden during an edit: an existing
              meal is always reconciled in the manual form, never re-estimated. */}
          {!logger.editingId && (
            <View style={styles.modeRow}>
              <ModeButton
                label="Manual"
                active={entryMode === 'manual'}
                onPress={() => setEntryMode('manual')}
              />
              <ModeButton
                label="Describe"
                active={entryMode === 'describe'}
                onPress={() => setEntryMode('describe')}
              />
            </View>
          )}

          {entryMode === 'describe' && !logger.editingId ? (
            <DescribePanel estimate={estimate} onUse={handleUseCandidate} />
          ) : (
            <>
              {logger.appliedEstimateName && (
                <View style={styles.estimateBanner}>
                  <Text style={styles.estimateBannerText}>
                    Estimated from “{logger.appliedEstimateName}”. Review and edit before saving.
                  </Text>
                </View>
              )}

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

              {/* Optional fat breakdown. Visible + editable so an applied USDA
                  estimate is never hidden; leaving these blank saves NULL. */}
              <Text style={styles.optionalHeading}>FAT BREAKDOWN (OPTIONAL)</Text>
              {OPTIONAL_FAT_CONFIGS.map((field) => (
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

              {logger.editingId && (
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={logger.cancelEdit}
                  disabled={logger.isSubmitting}
                >
                  <Text style={styles.cancelButtonText}>CANCEL EDIT</Text>
                </TouchableOpacity>
              )}
            </>
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
                onEdit={() => handleBeginEdit(meal)}
                onDelete={() => handleDelete(meal)}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* Post-log feedback overlay. pointerEvents="none" so it never blocks taps. */}
      {toast && (
        <View style={styles.feedbackToast} pointerEvents="none">
          <Text style={styles.feedbackToastText}>{toast}</Text>
        </View>
      )}
      <FloatingXP amount={BASE_MEAL_XP} visible={showXp} onDone={() => setShowXp(false)} />
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
  // A missing `kind` is treated as a plain direct match (back-compat).
  const isComposite = candidate.kind === 'composite';
  const confidenceText = candidate.confidenceRange
    ? `${Math.round(candidate.confidenceRange.low * 100)}–${Math.round(candidate.confidenceRange.high * 100)}%`
    : `${Math.round(candidate.confidence * 100)}%`;

  return (
    <View style={[styles.candidateCard, isComposite && styles.compositeCard]}>
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
          <Text style={styles.confidenceText}>{confidenceText}</Text>
        </View>
      </View>

      {/* Composite estimates show their parsed ingredients + assumptions BEFORE
          the user commits, so the approximation is transparent. */}
      {isComposite && <Text style={styles.compositeTag}>~ COMPOSITE ESTIMATE</Text>}

      <Text style={styles.candidateMacros}>
        {formatMacro(serving.calories)} cal · {formatMacro(serving.proteinG)}P ·{' '}
        {formatMacro(serving.carbsG)}C · {formatMacro(serving.fatG)}F
      </Text>

      {isComposite && candidate.components && candidate.components.length > 0 && (
        <View style={styles.componentList}>
          {candidate.components.map((component, index) => (
            <Text key={`${component.displayName}-${index}`} style={styles.componentLine}>
              {component.macros
                ? `• ${component.displayName} — ${component.servingDescription} · ${formatMacro(component.macros.calories)} cal`
                : `• ${component.displayName} — no USDA match (not counted)`}
            </Text>
          ))}
        </View>
      )}

      {isComposite && candidate.assumptions && candidate.assumptions.length > 0 && (
        <View style={styles.assumptionBox}>
          {candidate.assumptions.map((assumption, index) => (
            <Text key={`assumption-${index}`} style={styles.assumptionText}>
              {assumption}
            </Text>
          ))}
        </View>
      )}

      {candidate.warnings && candidate.warnings.length > 0 && (
        <View style={styles.warningBox}>
          {candidate.warnings.map((warning, index) => (
            <Text key={`warning-${index}`} style={styles.warningText}>
              ⚠ {warning}
            </Text>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.useButton} onPress={() => onUse(candidate)}>
        <Text style={styles.useButtonText}>USE &amp; EDIT</Text>
      </TouchableOpacity>
    </View>
  );
}

// Human label for a meal's provenance. NULL source = a legacy row, shown as
// "manual" so old logs stay readable and grouped with manual entries.
function sourceLabel(source: MealLog['source']): string {
  if (source === 'user_estimate') return 'estimate';
  if (source === 'usda_fdc') return 'USDA';
  return 'manual';
}

function MealRow({
  meal,
  isEditing,
  onEdit,
  onDelete,
}: {
  meal: MealLog;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const calories = meal.calories * meal.quantity;
  const protein = meal.proteinG * meal.quantity;
  const carbs = meal.carbsG * meal.quantity;
  const fat = meal.fatG * meal.quantity;

  return (
    <View style={[styles.mealCard, isEditing && styles.mealCardEditing]}>
      <View style={styles.mealRowTop}>
        <View style={styles.mealInfo}>
          <Text style={styles.mealName} numberOfLines={1}>{meal.freeText}</Text>
          <Text style={styles.mealMeta}>
            {formatMealTime(meal.eatenAt)} · {meal.mealType} · {sourceLabel(meal.source)} · qty {formatMacro(meal.quantity)}
          </Text>
        </View>
        <View style={styles.mealMacros}>
          <Text style={styles.mealCalories}>{formatMacro(calories)} cal</Text>
          <Text style={styles.mealMacroDetail}>
            {formatMacro(protein)}P · {formatMacro(carbs)}C · {formatMacro(fat)}F
          </Text>
        </View>
      </View>
      {/* Edit loads this row back into the form; Delete removes it (with confirm). */}
      <View style={styles.mealActions}>
        <TouchableOpacity style={styles.mealActionBtn} onPress={onEdit}>
          <Text style={styles.mealActionText}>{isEditing ? 'Editing…' : 'Edit'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.mealActionBtn} onPress={onDelete}>
          <Text style={[styles.mealActionText, styles.mealActionDelete]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  feedbackToast: {
    position: 'absolute',
    top: 70,
    alignSelf: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 50,
    paddingHorizontal: 18,
    paddingVertical: 10,
    zIndex: 1000,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  },
  feedbackToastText: { fontFamily: FontFamily.displayBold, fontSize: 14, color: Colors.background },
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
  compositeCard: { borderColor: Colors.gold + '55' },
  compositeTag: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 10,
    letterSpacing: 1,
    color: Colors.gold,
    marginBottom: 8,
  },
  componentList: { marginBottom: 10, gap: 3 },
  componentLine: { fontFamily: FontFamily.body, fontSize: 11, color: Colors.textSecondary },
  assumptionBox: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
    gap: 3,
  },
  assumptionText: { fontFamily: FontFamily.body, fontSize: 10, color: Colors.textSecondary },
  warningBox: { marginBottom: 10, gap: 3 },
  warningText: { fontFamily: FontFamily.body, fontSize: 10, color: Colors.accent },
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
  optionalHeading: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 11,
    color: Colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
  },
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
    backgroundColor: Colors.surface2,
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
    backgroundColor: Colors.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    marginBottom: 8,
  },
  mealCardEditing: { borderColor: Colors.primary + '88' },
  mealRowTop: { flexDirection: 'row', alignItems: 'center' },
  mealActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  mealActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  mealActionText: { fontFamily: FontFamily.bodyMedium, fontSize: 12, color: Colors.textPrimary },
  mealActionDelete: { color: Colors.error },
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
