import React, { useState } from 'react';
import { View, Pressable, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FontFamily, Spacing, Type, useTheme } from '../../theme';
import {
  Screen,
  Text,
  Button,
  TextField,
  ScreenHeader,
  Card,
  AppIcon,
  Avatar,
  TargetRow,
} from '../../components/ui';
import { AppIconName } from '../../components/ui/AppIcon';
import { calculateMacros, GoalType, validateMacroTargets } from '../../lib/macros';
import { updateOnboardingProfile, slugifyUsername } from '../../services/profileService';
import { useUserStore } from '../../store/userStore';
import { supabase } from '../../lib/supabase';

interface GoalOption {
  id: GoalType;
  icon: AppIconName;
  label: string;
  sub: string;
}

const GOALS: GoalOption[] = [
  { id: 'muscle', icon: 'protein', label: 'Build muscle', sub: 'Higher protein and calorie targets to support training.' },
  { id: 'lose_weight', icon: 'trend-down', label: 'Lose weight', sub: 'A steady calorie deficit while keeping protein high.' },
  { id: 'eat_cleaner', icon: 'salad', label: 'Eat cleaner', sub: 'Balanced targets that reward whole-food choices.' },
  { id: 'just_track', icon: 'edit', label: 'Just track', sub: 'Neutral targets — see your patterns without pressure.' },
];

const GOAL_BLURB: Record<GoalType, string> = {
  muscle: 'Recommended for building muscle.',
  lose_weight: 'Recommended for losing weight.',
  eat_cleaner: 'Recommended for eating cleaner.',
  just_track: 'A neutral starting point.',
};

export default function OnboardingGoalsScreen() {
  const { colors } = useTheme();
  const refreshStats = useUserStore((s) => s.refreshStats);
  const user = useUserStore((s) => s.user);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [name, setName] = useState(
    user?.name && !/^user_[0-9a-f]{8}/i.test(user.name) ? user.name : '',
  );
  const [university, setUniversity] = useState('Rutgers University');
  const [nameError, setNameError] = useState<string | null>(null);
  const [goalType, setGoalType] = useState<GoalType>('muscle');
  const [macros, setMacros] = useState(calculateMacros('muscle'));
  const [saving, setSaving] = useState(false);

  function selectGoal(id: GoalType) {
    setGoalType(id);
    setMacros(calculateMacros(id));
  }
  function bump(key: keyof typeof macros, delta: number, min: number) {
    setMacros((m) => ({ ...m, [key]: Math.max(min, m[key] + delta) }));
  }

  // Calorie-source split for the stacked bar
  const proKcal = macros.protein * 4;
  const carbKcal = macros.carbs * 4;
  const fatKcal = macros.fats * 9;
  const totalKcal = Math.max(1, proKcal + carbKcal + fatKcal);
  const pct = (n: number) => `${Math.round((n / totalKcal) * 100)}%`;

  async function finish() {
    if (saving) return;
    const displayName = name.trim();
    if (!displayName) {
      setNameError('Enter a display name.');
      setStep(1);
      return;
    }
    const macroError = validateMacroTargets(macros);
    if (macroError) {
      Alert.alert('Check your targets', macroError);
      setStep(3);
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw new Error('Not signed in');
      await updateOnboardingProfile(data.user.id, {
        username: slugifyUsername(displayName),
        displayName,
        university: university.trim() || 'Rutgers University',
        goalType,
        goalCalories: macros.calories,
        goalProteinG: macros.protein,
        goalCarbsG: macros.carbs,
        goalUnsaturatedFatG: macros.fats,
      });
      await refreshStats(); // sets needsOnboarding = false → App routes onward
    } catch (err: any) {
      Alert.alert('Could not save your goals', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function onContinue() {
    if (step === 1) {
      if (!name.trim()) {
        setNameError('Enter a display name.');
        return;
      }
      setNameError(null);
      setStep(2);
    } else if (step === 2) setStep(3);
    else if (step === 3) setStep(4);
    else void finish();
  }

  function onBack() {
    if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3 | 4);
  }

  const displayName = name.trim() || 'Your name';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen scroll padded contentStyle={{ flexGrow: 1 }}>
        <ScreenHeader onBack={step > 1 ? onBack : undefined} progress={{ step, total: 4 }} />

        {/* ── Step 1 · Identity ─────────────────────────────────────── */}
        {step === 1 && (
          <Animated.View entering={FadeIn.duration(250)} style={{ marginTop: 26, gap: 24 }}>
            <Text style={[Type.title, { fontSize: 28, color: colors.ink }]}>
              What should your league call you?
            </Text>
            <View style={{ gap: 12 }}>
              <TextField
                label="Display name"
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  if (nameError) setNameError(null);
                }}
                error={nameError}
                autoCapitalize="words"
                autoFocus
              />
              <TextField label="University" value={university} onChangeText={setUniversity} autoCapitalize="words" />
            </View>

            {/* What the league sees */}
            <Card padded>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AppIcon name="eye" size={14} color={colors.textSecondary} />
                <Text variant="overline" color={colors.textSecondary}>What the league sees</Text>
              </View>
              <View
                style={{
                  marginTop: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  backgroundColor: colors.canvas,
                  borderRadius: 12,
                  padding: 10,
                }}
              >
                <Text style={{ fontFamily: FontFamily.numBold, fontSize: 15, color: colors.textSecondary, width: 18 }}>4</Text>
                <Avatar name={displayName} size={32} />
                <View style={{ flex: 1 }}>
                  <Text variant="cardTitle" color={colors.ink} numberOfLines={1}>{displayName}</Text>
                  <Text variant="labelSm" color={colors.textSecondary}>{university.trim() || 'University'}</Text>
                </View>
                <Text style={{ fontFamily: FontFamily.numBold, fontSize: 15, color: colors.ink }}>
                  196 <Text style={{ fontFamily: FontFamily.semibold, fontSize: 10, color: colors.textSecondary }}>LP</Text>
                </Text>
              </View>
              <Text variant="label" color={colors.textSecondary} style={{ marginTop: 10 }}>
                The public leaderboard shows your display name, avatar, university, streak, and League Points — never your private meal details.
              </Text>
            </Card>
          </Animated.View>
        )}

        {/* ── Step 2 · Goal ─────────────────────────────────────────── */}
        {step === 2 && (
          <Animated.View entering={FadeIn.duration(250)} style={{ marginTop: 26, gap: 10 }}>
            <Text style={[Type.title, { fontSize: 28, color: colors.ink, marginBottom: 14 }]}>
              What are you working toward?
            </Text>
            {GOALS.map((g) => {
              const active = goalType === g.id;
              return (
                <Pressable
                  key={g.id}
                  onPress={() => selectGoal(g.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    backgroundColor: colors.card,
                    borderRadius: 16,
                    borderWidth: active ? 2 : 1.5,
                    borderColor: active ? colors.scarlet : colors.borderCard,
                    padding: 15,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: active ? colors.brandTint : colors.track,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AppIcon name={g.icon} size={20} color={active ? colors.scarlet : colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="subhead" color={colors.ink}>{g.label}</Text>
                    <Text variant="label" color={colors.textSecondary} style={{ marginTop: 1 }}>{g.sub}</Text>
                  </View>
                  {active ? (
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: colors.scarlet,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <AppIcon name="checkmark" size={13} color={colors.onPrimary} strokeWidth={3} />
                    </View>
                  ) : (
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.borderInput }} />
                  )}
                </Pressable>
              );
            })}
          </Animated.View>
        )}

        {/* ── Step 3 · Targets ──────────────────────────────────────── */}
        {step === 3 && (
          <Animated.View entering={FadeIn.duration(250)} style={{ marginTop: 26 }}>
            <Text style={[Type.title, { fontSize: 28, color: colors.ink }]}>Your daily targets</Text>
            <Text variant="label" color={colors.textSecondary} style={{ marginTop: 8 }}>
              {GOAL_BLURB[goalType]} You can edit these anytime in Settings.
            </Text>

            <Card padded={false} style={{ marginTop: 20, overflow: 'hidden' }}>
              <TargetRow label="Calories" value={macros.calories.toLocaleString()} unit="kcal"
                onDecrement={() => bump('calories', -50, 1500)} onIncrement={() => bump('calories', 50, 1500)} />
              <TargetRow label="Protein" value={macros.protein} unit="g"
                onDecrement={() => bump('protein', -5, 0)} onIncrement={() => bump('protein', 5, 0)} />
              <TargetRow label="Carbohydrates" value={macros.carbs} unit="g"
                onDecrement={() => bump('carbs', -5, 0)} onIncrement={() => bump('carbs', 5, 0)} />
              <TargetRow label="Unsaturated fat" value={macros.fats} unit="g" showDivider={false}
                onDecrement={() => bump('fats', -2, 0)} onIncrement={() => bump('fats', 2, 0)} />
            </Card>

            {/* Calorie source */}
            <Card padded style={{ marginTop: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="labelSm" color={colors.textSecondary}>Where your calories come from</Text>
                <Text variant="labelSm" color={colors.textSecondary}>{totalKcal.toLocaleString()} kcal</Text>
              </View>
              <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 9 }}>
                <View style={{ flex: proKcal, backgroundColor: colors.ink }} />
                <View style={{ flex: carbKcal, backgroundColor: colors.macroCarb }} />
                <View style={{ flex: fatKcal, backgroundColor: colors.macroFat }} />
              </View>
              <View style={{ flexDirection: 'row', gap: 14, marginTop: 9 }}>
                <Legend color={colors.ink} label={`Protein ${pct(proKcal)}`} />
                <Legend color={colors.macroCarb} label={`Carbs ${pct(carbKcal)}`} />
                <Legend color={colors.macroFat} label={`Fat ${pct(fatKcal)}`} />
              </View>
            </Card>
          </Animated.View>
        )}

        {/* ── Step 4 · Competition intro ────────────────────────────── */}
        {step === 4 && (
          <Animated.View entering={FadeIn.duration(250)} style={{ marginTop: 26 }}>
            <Text style={[Type.title, { fontSize: 28, color: colors.ink }]}>Every meal moves you up</Text>
            <Text variant="label" color={colors.textSecondary} style={{ marginTop: 8 }}>
              Confirmed meals earn XP for your level and League Points for your rank.
            </Text>

            <Card variant="hero" padded style={{ marginTop: 22 }}>
              {/* meal row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.canvas, borderRadius: 14, padding: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#F3E4D2', alignItems: 'center', justifyContent: 'center' }}>
                  <AppIcon name="meal" size={19} color="#A0642A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="subhead" color={colors.ink}>Chicken rice bowl</Text>
                  <Text variant="label" color={colors.textSecondary}>Logged 12:47 PM · 620 kcal</Text>
                </View>
              </View>
              <View style={{ alignItems: 'center', paddingVertical: 6 }}>
                <AppIcon name="arrow-down" size={16} color={colors.textTertiary} />
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <RewardTile value="+50 XP" color={colors.success} note="Levels up your profile" />
                <RewardTile value="+10 LP" color={colors.scarlet} note="Scores in your league" />
              </View>
              <View style={{ alignItems: 'center', paddingVertical: 6 }}>
                <AppIcon name="arrow-down" size={16} color={colors.textTertiary} />
              </View>
              {/* mini leaderboard */}
              <View style={{ backgroundColor: colors.canvas, borderRadius: 14, paddingVertical: 6 }}>
                <MiniRow rank="3" name="Maya" lp="214 LP" you={false} />
                <MiniRow rank="4" name="You" lp="196 LP" you />
              </View>
            </Card>
          </Animated.View>
        )}

        <View style={{ flex: 1, minHeight: 20 }} />
        <Button
          label={step === 4 ? 'Enter MacroLeague' : 'Continue'}
          loading={saving}
          loadingLabel="Setting up…"
          onPress={onContinue}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
      <Text variant="labelSm" color={colors.textSecondary}>{label}</Text>
    </View>
  );
}

function RewardTile({ value, color, note }: { value: string; color: string; note: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, borderRadius: 14, padding: 12 }}>
      <Text style={{ fontFamily: FontFamily.numBold, fontSize: 24, color }}>{value}</Text>
      <Text variant="labelSm" color={colors.textSecondary} style={{ marginTop: 3 }}>{note}</Text>
    </View>
  );
}

function MiniRow({ rank, name, lp, you }: { rank: string; name: string; lp: string; you: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 14,
        backgroundColor: you ? colors.brandTint : 'transparent',
        borderLeftWidth: you ? 3 : 0,
        borderLeftColor: colors.scarlet,
      }}
    >
      <Text style={{ fontFamily: FontFamily.numBold, fontSize: 14, color: you ? colors.scarlet : colors.textSecondary, width: 16 }}>{rank}</Text>
      <Avatar name={name} size={26} />
      <Text variant="cardTitle" color={colors.ink} style={{ flex: 1 }}>{name}</Text>
      <Text style={{ fontFamily: FontFamily.numBold, fontSize: 14, color: colors.ink }}>{lp}</Text>
    </View>
  );
}
