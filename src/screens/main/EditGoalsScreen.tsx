import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '../../theme';
import {
  Screen,
  ScreenHeader,
  Text,
  Card,
  Button,
  Chip,
  TargetRow,
} from '../../components/ui';
import { useUserStore } from '../../store/userStore';
import { supabase } from '../../lib/supabase';
import { getProfileGoals, updateProfileGoals } from '../../services/profileService';
import { toUserFacingMessage } from '../../lib/errors';

/**
 * Mirrors the `profiles` macro-goal CHECK constraints so the user gets a clear
 * message before the database rejects the update. `fats` here is the profile's
 * UNSATURATED fat goal (goal_unsaturated_fat_g); the trans-fat goal is always 0
 * and is not user-editable. Carb range follows migration 0002 (25-65%).
 */
function validateGoals(calories: number, protein: number, carbs: number, fats: number): string | null {
  // No diet-style hard limits (keto / low-fat / high-carb are all valid). Only
  // guard against broken input; the relaxed DB rules live in migration 0015.
  if (![calories, protein, carbs, fats].every(Number.isFinite)) {
    return 'Enter a valid number for every goal.';
  }
  if (protein < 0 || carbs < 0 || fats < 0) {
    return 'Goals can’t be negative.';
  }
  // Safety floor, also enforced by the DB (goal_calories > 1400).
  if (calories <= 1400) {
    return 'Calorie goal must be at least 1,500 kcal.';
  }
  return null;
}

const PRESETS = [
  { label: 'Build Muscle', cal: 2300, p: 170, c: 260, f: 38 },
  { label: 'Lose Weight', cal: 1900, p: 150, c: 190, f: 32 },
  { label: 'Maintain', cal: 2000, p: 130, c: 230, f: 35 },
] as const;

export default function EditGoalsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const dailyGoals = useUserStore((s) => s.dailyGoals);
  const setDailyGoals = useUserStore((s) => s.setDailyGoals);

  const [calories, setCalories] = useState(dailyGoals.calories);
  const [protein, setProtein] = useState(dailyGoals.protein);
  const [carbs, setCarbs] = useState(dailyGoals.carbs);
  const [fats, setFats] = useState(dailyGoals.fats);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load saved goals from Supabase so the steppers start from the persisted
  // profile values, not the local mock defaults. A failure falls back to the
  // defaults already in state rather than blocking the screen.
  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          return;
        }
        const goals = await getProfileGoals(data.user.id);
        if (active && goals) {
          if (goals.goalCalories > 0) setCalories(goals.goalCalories);
          if (goals.goalProteinG > 0) setProtein(goals.goalProteinG);
          if (goals.goalCarbsG > 0) setCarbs(goals.goalCarbsG);
          if (goals.goalUnsaturatedFatG > 0) setFats(goals.goalUnsaturatedFatG);
        }
      } catch {
        // Keep the local defaults already in state.
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    const validationError = validateGoals(calories, protein, carbs, fats);
    if (validationError) {
      Alert.alert('Check your goals', validationError);
      return;
    }

    setIsSaving(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        throw new Error('You are not signed in.');
      }
      // Persist to Supabase FIRST; only report success and sync the local store
      // after the database write actually succeeds.
      await updateProfileGoals(data.user.id, {
        goalCalories: calories,
        goalProteinG: protein,
        goalCarbsG: carbs,
        goalUnsaturatedFatG: fats,
      });
      // Keep the legacy local store in sync for any mock surfaces still reading it.
      setDailyGoals({ calories, protein, carbs, fats });
      Alert.alert('Saved', 'Your macro goals have been updated!');
      navigation.goBack();
    } catch (caughtError) {
      Alert.alert(
        'Could not save goals',
        toUserFacingMessage(caughtError, 'Please try again.'),
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.scarlet} size="large" />
        </View>
      </Screen>
    );
  }

  const proteinKcal = protein * 4;
  const carbKcal = carbs * 4;
  const fatKcal = fats * 9;
  const totalKcal = proteinKcal + carbKcal + fatKcal;

  const segments = [
    { label: 'Protein', kcal: proteinKcal, color: colors.ink },
    { label: 'Carbs', kcal: carbKcal, color: colors.macroCarb },
    { label: 'Fat', kcal: fatKcal, color: colors.macroFat },
  ];

  return (
    <Screen scroll>
      <ScreenHeader title="Edit goals" onBack={() => navigation.goBack()} />

      <Text variant="body" color={colors.textSecondary} style={{ marginTop: 4, marginBottom: 18 }}>
        Adjust your daily nutrition targets.
      </Text>

      <Card padded={false} style={{ marginBottom: 14 }}>
        <TargetRow
          label="Calories"
          value={calories}
          unit="kcal"
          onDecrement={() => setCalories((v) => Math.max(1500, v - 50))}
          onIncrement={() => setCalories((v) => Math.min(6000, v + 50))}
          canDecrement={calories > 1500}
          canIncrement={calories < 6000}
        />
        <TargetRow
          label="Protein"
          value={protein}
          unit="g"
          onDecrement={() => setProtein((v) => Math.max(0, v - 5))}
          onIncrement={() => setProtein((v) => Math.min(400, v + 5))}
          canDecrement={protein > 0}
          canIncrement={protein < 400}
        />
        <TargetRow
          label="Carbs"
          value={carbs}
          unit="g"
          onDecrement={() => setCarbs((v) => Math.max(0, v - 5))}
          onIncrement={() => setCarbs((v) => Math.min(600, v + 5))}
          canDecrement={carbs > 0}
          canIncrement={carbs < 600}
        />
        <TargetRow
          label="Unsaturated fat"
          value={fats}
          unit="g"
          showDivider={false}
          onDecrement={() => setFats((v) => Math.max(0, v - 5))}
          onIncrement={() => setFats((v) => Math.min(250, v + 5))}
          canDecrement={fats > 0}
          canIncrement={fats < 250}
        />
      </Card>

      <Text variant="body" color={colors.textTertiary} style={{ marginBottom: 14, fontSize: 12 }}>
        Trans-fat goal is fixed at 0g and isn't editable.
      </Text>

      {/* Where your calories come from — stacked energy bar */}
      <Card style={{ marginBottom: 14 }}>
        <Text variant="overline" color={colors.textSecondary}>
          Where your calories come from
        </Text>
        <View
          style={{
            flexDirection: 'row',
            height: 12,
            borderRadius: 6,
            overflow: 'hidden',
            marginTop: 12,
            backgroundColor: colors.track,
          }}
        >
          {totalKcal > 0 &&
            segments.map((seg) => (
              <View
                key={seg.label}
                style={{ flex: seg.kcal, backgroundColor: seg.color }}
              />
            ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 14 }}>
          {segments.map((seg) => (
            <View key={seg.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: seg.color }} />
              <Text variant="label" color={colors.textSecondary}>
                {seg.label}
              </Text>
              <Text variant="numInline" color={colors.ink} style={{ fontSize: 13 }}>
                {seg.kcal}
              </Text>
            </View>
          ))}
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginTop: 14,
          }}
        >
          <Text variant="label" color={colors.textSecondary}>
            Total from macros
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text variant="scoreStat" color={colors.ink}>
              {totalKcal}
            </Text>
            <Text variant="subhead" color={colors.textSecondary}>
              kcal
            </Text>
          </View>
        </View>
      </Card>

      {/* Quick presets */}
      <Text variant="overline" color={colors.textSecondary} style={{ marginBottom: 10 }}>
        Quick presets
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {PRESETS.map((preset) => (
          <Chip
            key={preset.label}
            label={preset.label}
            onPress={() => {
              setCalories(preset.cal);
              setProtein(preset.p);
              setCarbs(preset.c);
              setFats(preset.f);
            }}
          />
        ))}
      </View>

      <Button
        label="Save goals"
        onPress={save}
        loading={isSaving}
        loadingLabel="Saving…"
      />
    </Screen>
  );
}
