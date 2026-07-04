import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, TextInput, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { FontFamily, Radius, useTheme } from '../../theme';
import { useDailyTotals } from '../../hooks/useDailyTotals';
import { FatSubtypeTotal, MealLog, MealType } from '../../services/mealLogService';
import { useMealLogger, MealLogFields } from '../../hooks/useMealLogger';
import { useMealEstimate } from '../../hooks/useMealEstimate';
import { MealEstimateCandidate } from '../../services/nutrition/types';
import { useUserStore } from '../../store/userStore';
import { BASE_MEAL_XP, BASE_MEAL_POINTS } from '../../services/gamificationService';
import FloatingXP from '../../components/FloatingXP';
import {
  Screen,
  Text,
  Card,
  Button,
  Chip,
  Badge,
  SegmentedControl,
  AppIcon,
  Sheet,
} from '../../components/ui';

// Trans fat is a "keep it near zero" nutrient — the profile goal is fixed at 0,
// so we warn (never block) once the day crosses this small health limit (~WHO
// guidance). Logging is always allowed; this is purely a nudge.
const TRANS_FAT_DAILY_LIMIT_G = 2;

function num(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

type EntryMode = 'describe' | 'manual';
const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

type FieldConfig = { key: keyof MealLogFields; label: string; placeholder: string; keyboardType?: 'default' | 'decimal-pad' };

const FIELD_CONFIGS: FieldConfig[] = [
  { key: 'freeText', label: 'Food name', placeholder: 'Chicken rice bowl' },
  { key: 'calories', label: 'Calories', placeholder: '520', keyboardType: 'decimal-pad' },
  { key: 'proteinG', label: 'Protein (g)', placeholder: '38', keyboardType: 'decimal-pad' },
  { key: 'carbsG', label: 'Carbs (g)', placeholder: '62', keyboardType: 'decimal-pad' },
  { key: 'fatG', label: 'Total fat (g)', placeholder: '14', keyboardType: 'decimal-pad' },
  { key: 'quantity', label: 'Quantity', placeholder: '1', keyboardType: 'decimal-pad' },
];

const OPTIONAL_FAT_CONFIGS: FieldConfig[] = [
  { key: 'saturatedFatG', label: 'Saturated fat', placeholder: 'optional', keyboardType: 'decimal-pad' },
  { key: 'transFatG', label: 'Trans fat', placeholder: 'optional', keyboardType: 'decimal-pad' },
  { key: 'unsaturatedFatG', label: 'Unsaturated fat', placeholder: 'optional', keyboardType: 'decimal-pad' },
];

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
function formatSubtype(total: FatSubtypeTotal): string {
  const grams = `${fmt(total.grams)}g`;
  return total.knownCount === 0 ? '—' : total.missingCount > 0 ? `${grams}*` : grams;
}
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function MealLoggerScreen() {
  const { colors } = useTheme();
  const [today, setToday] = useState(() => new Date());
  const logger = useMealLogger();
  const estimate = useMealEstimate();
  const daily = useDailyTotals(today);
  const refreshStats = useUserStore((s) => s.refreshStats);
  const navigation = useNavigation<any>();
  const [entryMode, setEntryMode] = useState<EntryMode>('describe');
  const [showXp, setShowXp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Non-blocking trans-fat nudge: the day's projected trans-fat total, or null.
  const [transWarn, setTransWarn] = useState<number | null>(null);

  useFocusEffect(useCallback(() => setToday(new Date()), []));
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const editing = !!logger.editingId;
  const showManual = entryMode === 'manual' || editing;

  async function handleSubmit() {
    // Capture the meal's trans fat BEFORE submitting — submit() clears the form
    // on success. `result.logged` is true only for a NEW insert (not edits), so
    // the projected-total math below stays correct.
    const mealTrans = num(logger.fields.transFatG);
    const qty = num(logger.fields.quantity) || 1;
    const priorTrans = daily.totals.transFat.grams;

    const result = await logger.submit();
    daily.refresh();
    if (!result.logged) return;
    setShowXp(true);
    setToast(`+${BASE_MEAL_XP} XP · +${BASE_MEAL_POINTS} LP`);
    await refreshStats();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);

    // Soft nudge (never blocks): flag when this meal pushes the day over the
    // trans-fat health limit.
    const projectedTrans = priorTrans + mealTrans * qty;
    if (mealTrans > 0 && projectedTrans > TRANS_FAT_DAILY_LIMIT_G) {
      setTransWarn(projectedTrans);
    }
  }

  function handleUseCandidate(c: MealEstimateCandidate) {
    logger.applyEstimate(c);
    setEntryMode('manual');
  }
  function handleBeginEdit(meal: MealLog) {
    logger.beginEdit(meal);
    setEntryMode('manual');
  }
  function handleDelete(meal: MealLog) {
    Alert.alert('Delete meal?', `Remove "${meal.freeText}" from your log?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { if (await logger.removeMeal(meal.id)) daily.refresh(); } },
    ]);
  }

  return (
    <Screen scroll bottomSpace={96}>
      <Text variant="heading" color={colors.ink} style={{ marginBottom: 14 }}>Log a meal</Text>

      {/* Today snapshot */}
      <Card style={{ marginBottom: 14 }}>
        <Text variant="overline" color={colors.textSecondary} style={{ marginBottom: 10 }}>Today so far</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <MiniStat label="Calories" value={fmt(daily.totals.calories)} goal={daily.goals?.calories} />
          <MiniStat label="Protein" value={`${fmt(daily.totals.proteinG)}g`} goal={daily.goals?.proteinG} unit="g" />
          <MiniStat label="Carbs" value={`${fmt(daily.totals.carbsG)}g`} goal={daily.goals?.carbsG} unit="g" />
          <MiniStat label="Unsat" value={formatSubtype(daily.totals.unsaturatedFat)} goal={daily.goals?.unsaturatedFatG} unit="g" />
        </View>
      </Card>

      {/* Add / edit */}
      <Card style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Text variant="section" color={colors.ink} style={{ flex: 1 }}>{editing ? 'Edit meal' : 'Add a meal'}</Text>
        </View>

        {!editing ? (
          <SegmentedControl
            segments={['Describe', 'Manual']}
            value={entryMode === 'describe' ? 0 : 1}
            onChange={(i) => setEntryMode(i === 0 ? 'describe' : 'manual')}
            style={{ marginBottom: 16 }}
          />
        ) : null}

        {!showManual ? (
          <DescribePanel estimate={estimate} onUse={handleUseCandidate} />
        ) : (
          <View style={{ gap: 12 }}>
            {logger.appliedEstimateName ? (
              <View style={{ backgroundColor: colors.successTint, borderRadius: 12, padding: 10, paddingHorizontal: 12 }}>
                <Text variant="label" color={colors.successDeep}>
                  Estimated from “{logger.appliedEstimateName}”. Review and edit before saving.
                </Text>
              </View>
            ) : null}

            {FIELD_CONFIGS.map((f) => (
              <Field key={f.key} config={f} value={logger.fields[f.key]} onChange={(v) => logger.setField(f.key, v)} />
            ))}

            <Text variant="overline" color={colors.textSecondary} style={{ marginTop: 4 }}>Fat breakdown (optional)</Text>
            {OPTIONAL_FAT_CONFIGS.map((f) => (
              <Field key={f.key} config={f} value={logger.fields[f.key]} onChange={(v) => logger.setField(f.key, v)} />
            ))}

            <View>
              <Text variant="label" color={colors.textSecondary} style={{ marginBottom: 8 }}>Meal</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {MEAL_TYPES.map((t) => (
                  <Chip key={t} label={cap(t)} selected={logger.mealType === t} onPress={() => logger.setMealType(t)} />
                ))}
              </View>
            </View>

            {logger.error ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AppIcon name="circle-alert" size={14} color={colors.error} />
                <Text variant="label" color={colors.error} style={{ flex: 1 }}>{logger.error}</Text>
              </View>
            ) : null}

            <Button
              label={editing ? 'Update meal' : 'Save meal'}
              loading={logger.isSubmitting}
              loadingLabel="Saving…"
              onPress={handleSubmit}
            />
            {editing ? <Button label="Cancel edit" variant="ghost" onPress={logger.cancelEdit} /> : null}
          </View>
        )}
      </Card>

      {/* Confirmed meals */}
      <Text variant="section" color={colors.ink} style={{ marginBottom: 8, paddingHorizontal: 2 }}>Confirmed meals</Text>
      {daily.meals.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
          <AppIcon name="meal" size={30} color={colors.textTertiary} />
          <Text variant="label" color={colors.textSecondary} style={{ marginTop: 8 }}>No meals logged yet today.</Text>
        </Card>
      ) : (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {daily.meals.map((meal, i) => (
            <MealRow
              key={meal.id}
              meal={meal}
              showDivider={i > 0}
              isEditing={logger.editingId === meal.id}
              onEdit={() => handleBeginEdit(meal)}
              onDelete={() => handleDelete(meal)}
            />
          ))}
        </Card>
      )}

      {toast ? (
        <Animated.View
          entering={FadeInDown.duration(200)}
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 64,
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: colors.ink,
            borderRadius: 99,
            paddingVertical: 10,
            paddingHorizontal: 16,
          }}
        >
          <AppIcon name="checkmark" size={15} color={colors.success} strokeWidth={3} />
          <Text color={colors.card} style={{ fontFamily: FontFamily.numBold, fontSize: 14 }}>{toast}</Text>
        </Animated.View>
      ) : null}
      <FloatingXP amount={BASE_MEAL_XP} visible={showXp} onDone={() => setShowXp(false)} />

      <Sheet visible={transWarn !== null} onClose={() => setTransWarn(null)} title="Trans-fat check" showClose>
        <View style={{ paddingHorizontal: 20, paddingTop: 4, gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: colors.goldTint, borderRadius: 14, padding: 14 }}>
            <AppIcon name="warning" size={20} color={colors.goldText} />
            <Text variant="body" color={colors.ink} style={{ flex: 1 }}>
              You're at{' '}
              <Text variant="body" color={colors.ink} style={{ fontFamily: FontFamily.semibold }}>
                {transWarn ? transWarn.toFixed(1) : '0'}g
              </Text>{' '}
              of trans fat today. Health guidance is to keep trans fat as close to zero as possible (under about {TRANS_FAT_DAILY_LIMIT_G}g a day) — your meal still logged.
            </Text>
          </View>
          <Text variant="body" color={colors.textSecondary}>
            Consider what you can do next: swap fried or heavily processed items for whole-food fats at your next meal — grilled or baked proteins, nuts, olive oil, or avocado. MacroCoach can suggest specifics for your goals.
          </Text>
          <Button
            label="Ask MacroCoach"
            icon="coach"
            onPress={() => {
              setTransWarn(null);
              navigation.navigate('Coach');
            }}
          />
          <Button label="Got it" variant="ghost" onPress={() => setTransWarn(null)} />
        </View>
      </Sheet>
    </Screen>
  );
}

function MiniStat({ label, value, goal, unit = '' }: { label: string; value: string; goal?: number | null; unit?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: FontFamily.numBold, fontSize: 18, color: colors.ink }}>{value}</Text>
      <Text variant="labelSm" color={colors.textSecondary} style={{ marginTop: 1 }}>{label}</Text>
      {goal ? <Text variant="labelSm" color={colors.textTertiary}>/ {goal}{unit}</Text> : null}
    </View>
  );
}

function Field({ config, value, onChange }: { config: FieldConfig; value: string; onChange: (v: string) => void }) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderWidth: 1.5,
        borderColor: focused ? colors.ink : colors.borderInput,
        borderRadius: Radius.input,
        paddingVertical: 9,
        paddingHorizontal: 16,
      }}
    >
      <Text variant="labelSm" color={focused ? colors.ink : colors.textSecondary}>{config.label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={config.placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={config.keyboardType ?? 'default'}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ fontFamily: FontFamily.regular, fontSize: 15.5, color: colors.ink, padding: 0, marginTop: 2 }}
      />
    </View>
  );
}

const STAGES = ['Reading your description', 'Matching USDA foods', 'Crunching the macros'];

function DescribePanel({
  estimate,
  onUse,
}: {
  estimate: ReturnType<typeof useMealEstimate>;
  onUse: (c: MealEstimateCandidate) => void;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!estimate.isEstimating) {
      setStage(0);
      return;
    }
    const timers = [
      setTimeout(() => setStage(1), 900),
      setTimeout(() => setStage(2), 1800),
    ];
    return () => timers.forEach(clearTimeout);
  }, [estimate.isEstimating]);

  return (
    <View style={{ gap: 12 }}>
      <Text variant="label" color={colors.textSecondary}>
        Describe your meal in plain words — we estimate the macros from USDA data. You confirm and edit before saving.
      </Text>
      <View
        style={{
          backgroundColor: colors.card,
          borderWidth: 1.5,
          borderColor: focused ? colors.ink : colors.borderInput,
          borderRadius: Radius.input,
          padding: 14,
          minHeight: 74,
        }}
      >
        <TextInput
          value={estimate.query}
          onChangeText={estimate.setQuery}
          placeholder="e.g. grilled chicken breast with broccoli and rice"
          placeholderTextColor={colors.textTertiary}
          multiline
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ fontFamily: FontFamily.regular, fontSize: 15.5, color: colors.ink, textAlignVertical: 'top', minHeight: 46 }}
        />
      </View>

      <Button
        label="Estimate macros"
        icon="sparkles"
        loading={estimate.isEstimating}
        loadingLabel="Estimating…"
        onPress={estimate.estimate}
      />

      {estimate.isEstimating ? (
        <Card style={{ gap: 10 }}>
          {STAGES.map((label, i) => {
            const done = i < stage;
            const active = i === stage;
            return (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {done ? (
                  <AppIcon name="check" size={18} color={colors.success} />
                ) : active ? (
                  <ActivityIndicator size="small" color={colors.scarlet} />
                ) : (
                  <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.borderInput }} />
                )}
                <Text variant="label" color={done || active ? colors.ink : colors.textTertiary}>{label}</Text>
              </View>
            );
          })}
        </Card>
      ) : null}

      {estimate.error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AppIcon name="circle-alert" size={14} color={colors.error} />
          <Text variant="label" color={colors.error} style={{ flex: 1 }}>{estimate.error}</Text>
        </View>
      ) : null}

      {estimate.candidates.length > 0 && !estimate.isEstimating ? (
        <Animated.View entering={FadeIn.duration(250)} style={{ gap: 10 }}>
          <Text variant="overline" color={colors.textSecondary}>
            {estimate.candidates.length} match{estimate.candidates.length === 1 ? '' : 'es'}{estimate.cached ? ' · cached' : ''}
          </Text>
          {estimate.candidates.map((c) => (
            <CandidateCard key={c.externalId} candidate={c} onUse={onUse} />
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

function CandidateCard({ candidate, onUse }: { candidate: MealEstimateCandidate; onUse: (c: MealEstimateCandidate) => void }) {
  const { colors } = useTheme();
  const { serving } = candidate;
  const isComposite = candidate.kind === 'composite';
  const conf = candidate.confidence;
  const confPct = candidate.confidenceRange
    ? `${Math.round(candidate.confidenceRange.low * 100)}–${Math.round(candidate.confidenceRange.high * 100)}%`
    : `${Math.round(conf * 100)}%`;

  return (
    <View style={{ backgroundColor: colors.canvas, borderRadius: 14, padding: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text variant="cardTitle" color={colors.ink} numberOfLines={2}>{candidate.name}</Text>
          <Text variant="labelSm" color={colors.textSecondary} numberOfLines={1} style={{ marginTop: 2 }}>
            {[candidate.brandName, candidate.dataType, candidate.servingDescription].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Badge
          label={isComposite ? `~ ${confPct}` : confPct}
          tone={isComposite ? 'composite' : conf >= 0.7 ? 'confidence-high' : 'confidence-med'}
          dot={!isComposite}
        />
      </View>

      <Text variant="label" color={colors.textSecondary} style={{ marginTop: 8 }}>
        <Text variant="label" color={colors.ink} style={{ fontFamily: FontFamily.semibold }}>{fmt(serving.calories)}</Text> kcal ·{' '}
        {fmt(serving.proteinG)}P · {fmt(serving.carbsG)}C · {fmt(serving.fatG)}F
      </Text>

      {isComposite && candidate.assumptions && candidate.assumptions.length > 0 ? (
        <View style={{ marginTop: 8, gap: 2 }}>
          {candidate.assumptions.map((a, i) => (
            <Text key={i} variant="labelSm" color={colors.textTertiary}>{a}</Text>
          ))}
        </View>
      ) : null}

      {candidate.warnings && candidate.warnings.length > 0 ? (
        <View style={{ marginTop: 8, gap: 3 }}>
          {candidate.warnings.map((w, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 5, alignItems: 'flex-start' }}>
              <AppIcon name="warning" size={13} color={colors.streak} />
              <Text variant="labelSm" color={colors.streak} style={{ flex: 1 }}>{w}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Button label="Use & edit" variant="secondary" size="md" onPress={() => onUse(candidate)} fullWidth={false} style={{ marginTop: 12, alignSelf: 'flex-start', paddingHorizontal: 20 }} />
    </View>
  );
}

function sourceLabel(source: MealLog['source']): string {
  if (source === 'user_estimate') return 'estimate';
  if (source === 'usda_fdc') return 'USDA';
  return 'manual';
}

function MealRow({
  meal,
  isEditing,
  showDivider,
  onEdit,
  onDelete,
}: {
  meal: MealLog;
  isEditing: boolean;
  showDivider: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const calories = meal.calories * meal.quantity;
  const protein = meal.proteinG * meal.quantity;
  const time = new Date(meal.eatenAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <View style={{ padding: 14, borderTopWidth: showDivider ? 1 : 0, borderTopColor: colors.rowDivider, backgroundColor: isEditing ? colors.brandTint : 'transparent' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text variant="cardTitle" color={colors.ink} numberOfLines={1}>{meal.freeText}</Text>
          <Text variant="labelSm" color={colors.textSecondary} style={{ marginTop: 1 }}>
            {time} · {cap(meal.mealType)} · {sourceLabel(meal.source)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: FontFamily.numBold, fontSize: 15, color: colors.ink }}>
            {fmt(calories)} <Text style={{ fontFamily: FontFamily.semibold, fontSize: 10.5, color: colors.textTertiary }}>kcal</Text>
          </Text>
          <Text variant="labelSm" color={colors.textSecondary}>{fmt(protein)}g protein</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
        <Pressable onPress={onEdit} hitSlop={6}>
          <Text variant="label" color={colors.scarlet} style={{ fontFamily: FontFamily.semibold }}>{isEditing ? 'Editing…' : 'Edit'}</Text>
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={6}>
          <Text variant="label" color={colors.error} style={{ fontFamily: FontFamily.semibold }}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}
