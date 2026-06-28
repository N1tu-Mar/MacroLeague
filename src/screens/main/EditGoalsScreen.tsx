import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Colors, FontFamily } from '../../theme';
import AppIcon from '../../components/ui/AppIcon';
import { useUserStore } from '../../store/userStore';
import { supabase } from '../../lib/supabase';
import { getProfileGoals, updateProfileGoals } from '../../services/profileService';

/**
 * Mirrors the `profiles` macro-goal CHECK constraints so the user gets a clear
 * message before the database rejects the update. `fats` here is the profile's
 * UNSATURATED fat goal (goal_unsaturated_fat_g); the trans-fat goal is always 0
 * and is not user-editable. Carb range follows migration 0002 (25-65%).
 */
function validateGoals(calories: number, protein: number, carbs: number, fats: number): string | null {
  if (calories <= 1400) {
    return 'Calorie goal must be greater than 1400.';
  }
  if (protein < 50) {
    return 'Protein goal must be at least 50g.';
  }
  const carbEnergy = carbs * 4;
  if (carbEnergy < calories * 0.25 || carbEnergy > calories * 0.65) {
    return 'Carbs must supply between 25% and 65% of your calorie goal.';
  }
  if (fats * 9 < calories * 0.1) {
    return 'Unsaturated fat goal is too low; it must supply at least 10% of your calorie goal.';
  }
  return null;
}

export default function EditGoalsScreen({ navigation }: any) {
  const dailyGoals = useUserStore((s) => s.dailyGoals);
  const setDailyGoals = useUserStore((s) => s.setDailyGoals);

  const [calories, setCalories] = useState(dailyGoals.calories);
  const [protein, setProtein] = useState(dailyGoals.protein);
  const [carbs, setCarbs] = useState(dailyGoals.carbs);
  const [fats, setFats] = useState(dailyGoals.fats);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load saved goals from Supabase so the sliders start from the persisted
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
        caughtError instanceof Error ? caughtError.message : 'Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingBox]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <AppIcon name="back" size={17} color={Colors.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>EDIT MACRO GOALS</Text>
      <Text style={styles.subtitle}>Adjust your daily nutrition targets</Text>

      {/* Calorie floor is 1500 because the DB requires goal_calories > 1400. */}
      <MacroSlider label="Calories" value={calories} onChange={setCalories} min={1500} max={5000} step={50} unit="cal" color={Colors.primary} />
      <MacroSlider label="Protein" value={protein} onChange={setProtein} min={50} max={350} step={5} unit="g" color={Colors.primary} />
      <MacroSlider label="Carbs" value={carbs} onChange={setCarbs} min={50} max={500} step={5} unit="g" color={Colors.accent} />
      {/* This slider is the UNSATURATED fat goal — the only fat target the schema
          stores. Trans-fat goal is fixed at 0 (profiles_goal_trans_fat_zero). */}
      <MacroSlider label="Unsaturated Fat" value={fats} onChange={setFats} min={20} max={200} step={5} unit="g" color={Colors.gold} />
      <Text style={styles.transFatNote}>Trans-fat goal is fixed at 0g and isn't editable.</Text>

      {/* Quick Presets */}
      <View style={styles.presetSection}>
        <Text style={styles.sectionTitle}>QUICK PRESETS</Text>
        <View style={styles.presetRow}>
          {[
            { label: 'Build Muscle', cal: 2800, p: 200, c: 300, f: 85 },
            { label: 'Lose Weight', cal: 1800, p: 160, c: 180, f: 60 },
            { label: 'Maintain', cal: 2200, p: 150, c: 250, f: 70 },
          ].map((preset) => (
            <TouchableOpacity
              key={preset.label}
              style={styles.presetBtn}
              onPress={() => {
                setCalories(preset.cal);
                setProtein(preset.p);
                setCarbs(preset.c);
                setFats(preset.f);
              }}
            >
              <Text style={styles.presetLabel}>{preset.label}</Text>
              <Text style={styles.presetCal}>{preset.cal} cal</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
        onPress={save}
        disabled={isSaving}
      >
        <Text style={styles.saveBtnText}>{isSaving ? 'SAVING...' : 'SAVE GOALS'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function MacroSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  color,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  color: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <View style={sliderStyles.container}>
      <View style={sliderStyles.labelRow}>
        <Text style={sliderStyles.label}>{label}</Text>
        <Text style={[sliderStyles.value, { color }]}>
          {value}{unit}
        </Text>
      </View>
      <View style={sliderStyles.barBg}>
        <View style={[sliderStyles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <View style={sliderStyles.btnRow}>
        <TouchableOpacity
          style={sliderStyles.btn}
          onPress={() => onChange(Math.max(min, value - step))}
        >
          <Text style={sliderStyles.btnText}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={sliderStyles.btn}
          onPress={() => onChange(Math.min(max, value + step))}
        >
          <Text style={sliderStyles.btnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 12,
  },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  label: { fontFamily: FontFamily.bodyMedium, fontSize: 15, color: Colors.textPrimary },
  value: { fontFamily: FontFamily.displayBold, fontSize: 20 },
  barBg: { height: 6, borderRadius: 3, backgroundColor: Colors.surface2, marginBottom: 10 },
  barFill: { height: 6, borderRadius: 3 },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  btn: {
    flex: 1,
    backgroundColor: Colors.surface2,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnText: { fontFamily: FontFamily.displayBold, fontSize: 20, color: Colors.textPrimary },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingBox: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingTop: 60 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backText: { fontFamily: FontFamily.bodyMedium, fontSize: 15, color: Colors.primary },
  title: { fontFamily: FontFamily.displayBold, fontSize: 24, color: Colors.textPrimary, letterSpacing: 1, marginBottom: 4 },
  subtitle: { fontFamily: FontFamily.body, fontSize: 14, color: Colors.textSecondary, marginBottom: 24 },
  transFatNote: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: -4,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  presetSection: { marginTop: 8, marginBottom: 20 },
  presetRow: { flexDirection: 'row', gap: 8 },
  presetBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    alignItems: 'center',
  },
  presetLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 12, color: Colors.textPrimary },
  presetCal: { fontFamily: FontFamily.body, fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 50,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: FontFamily.displayBold, fontSize: 16, color: Colors.background },
});
