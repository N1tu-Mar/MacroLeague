import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import Animated, { FadeInDown, SlideInRight } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Colors, FontFamily } from '../../theme';
import { calculateMacros, GoalType } from '../../lib/macros';
import { updateOnboardingProfile, slugifyUsername } from '../../services/profileService';
import { useUserStore } from '../../store/userStore';
import AppIcon, { AppIconName } from '../../components/ui/AppIcon';
import PixelFlame from '../../components/PixelFlame';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');

interface GoalOption {
  id: GoalType;
  icon: AppIconName | 'flame';
  label: string;
  description: string;
  why: string;
  accentColor: string;
}

const GOALS: GoalOption[] = [
  {
    id: 'muscle',
    icon: 'protein',
    label: 'Build Muscle',
    description: 'High protein, caloric surplus',
    why: 'Gain strength and size.',
    accentColor: Colors.primary,
  },
  {
    id: 'lose_weight',
    icon: 'flame',
    label: 'Lose Weight',
    description: 'Caloric deficit, lean focus',
    why: 'Burn fat and get leaner.',
    accentColor: Colors.accent,
  },
  {
    id: 'eat_cleaner',
    icon: 'salad',
    label: 'Eat Cleaner',
    description: 'Whole foods, balanced macros',
    why: 'Better energy, cleaner habits.',
    accentColor: '#00D4FF',
  },
  {
    id: 'just_track',
    icon: 'chart',
    label: 'Just Track',
    description: 'No specific goal, just log',
    why: 'Data without a physique target.',
    accentColor: Colors.gold,
  },
];

// ─── Step dots ────────────────────────────────────────────────────────────────

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <View style={dots.row}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            dots.dot,
            i === step ? dots.active : i < step ? dots.done : dots.inactive,
          ]}
        />
      ))}
    </View>
  );
}
const dots = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot: { height: 6, borderRadius: 3 },
  active: { width: 24, backgroundColor: Colors.primary },
  done: { width: 8, backgroundColor: Colors.primary, opacity: 0.5 },
  inactive: { width: 8, backgroundColor: Colors.border },
});

// ─── Macro slider row ─────────────────────────────────────────────────────────

function MacroRow({
  label, value, unit, min, max, color, onChange,
}: {
  label: string; value: number; unit: string; min: number; max: number; color: string; onChange: (v: number) => void;
}) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const step = label === 'Calories' ? 50 : 5;
  return (
    <View style={macro.wrapper}>
      <View style={macro.labelRow}>
        <Text style={macro.label}>{label}</Text>
        <Text style={[macro.value, { color }]}>
          {value}
          <Text style={macro.unit}> {unit}</Text>
        </Text>
      </View>
      <View style={macro.trackWrapper}>
        <View style={macro.track}>
          <View style={[macro.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
        </View>
        <View style={macro.buttons}>
          <TouchableOpacity style={macro.btn} onPress={() => onChange(Math.max(min, value - step))}>
            <Text style={macro.btnText}>−</Text>
          </TouchableOpacity>
          <TouchableOpacity style={macro.btn} onPress={() => onChange(Math.min(max, value + step))}>
            <Text style={macro.btnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
const macro = StyleSheet.create({
  wrapper: { gap: 8 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontFamily: FontFamily.bodyMedium, fontSize: 13, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  value: { fontFamily: FontFamily.displayBold, fontSize: 22, color: Colors.textPrimary },
  unit: { fontFamily: FontFamily.body, fontSize: 13, color: Colors.textSecondary },
  trackWrapper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { flex: 1, height: 6, backgroundColor: Colors.surface2, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  buttons: { flexDirection: 'row', gap: 6 },
  btn: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: Colors.textPrimary, fontSize: 18, lineHeight: 22 },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function OnboardingGoalsScreen() {
  const refreshStats = useUserStore((s) => s.refreshStats);
  const user = useUserStore((s) => s.user);

  const [step, setStep] = useState<0 | 1 | 2>(0);
  // Pre-fill name from Google auth if it looks like a real name (not user_<id>)
  const [name, setName] = useState(
    user?.name && !/^user_[0-9a-f]{8}/i.test(user.name) ? user.name : '',
  );
  const [university, setUniversity] = useState('Rutgers University');
  const [goalType, setGoalType] = useState<GoalType>('muscle');
  const [macros, setMacros] = useState(calculateMacros('muscle'));
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function selectGoal(id: GoalType) {
    setGoalType(id);
    setMacros(calculateMacros(id));
  }

  function updateMacro(key: keyof typeof macros, value: number) {
    setMacros((prev) => ({ ...prev, [key]: value }));
  }

  async function finish() {
    // A real name is mandatory — never silently substitute a placeholder, or the
    // account would slip past the name gate and show a fallback on the leaderboard.
    const displayName = name.trim();
    if (!displayName) {
      Alert.alert('Enter your name to continue');
      setStep(0);
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
      // refreshStats sets needsOnboarding = false → App.tsx routes to TutorialScreen
      await refreshStats();
    } catch (err: any) {
      Alert.alert('Could not save your goals', err.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function advance() {
    if (step === 0) {
      if (!name.trim()) { Alert.alert('Enter your name to continue'); return; }
      setStep(1);
    } else if (step === 1) {
      setStep(2);
    } else {
      void finish();
    }
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar style="light" />
      <LinearGradient colors={['#0A0A0F', '#0D0D18', '#0A0A0F']} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header row */}
        <View style={s.topRow}>
          {step > 0 && (
            <TouchableOpacity style={s.backButton} onPress={() => setStep((p) => (p - 1) as 0 | 1 | 2)}>
              <Text style={s.backArrow}>←</Text>
            </TouchableOpacity>
          )}
          <View style={[s.dotsWrapper, step === 0 && s.dotsCenter]}>
            <StepDots step={step} total={3} />
          </View>
        </View>

        {/* ── Step 0: Name + University ──────────────────────────────── */}
        {step === 0 && (
          <Animated.View entering={FadeInDown.duration(400)} style={s.stepContainer}>
            <View style={s.titleSection}>
              <Text style={s.stepLabel}>STEP 1 OF 3</Text>
              <Text style={s.title}>Who are you?</Text>
              <Text style={s.subtitle}>
                Your name appears on the leaderboard. Make it count.
              </Text>
            </View>

            <View style={s.fieldWrapper}>
              <Text style={s.fieldLabel}>Your Name</Text>
              <View style={[s.inputContainer, focusedField === 'name' && s.inputFocused]}>
                <TextInput
                  style={s.input}
                  placeholder="First name or display name"
                  placeholderTextColor={Colors.textSecondary}
                  value={name}
                  onChangeText={setName}
                  autoCorrect={false}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            <View style={s.fieldWrapper}>
              <Text style={s.fieldLabel}>University</Text>
              <View style={[s.inputContainer, focusedField === 'uni' && s.inputFocused]}>
                <TextInput
                  style={s.input}
                  placeholder="Your university"
                  placeholderTextColor={Colors.textSecondary}
                  value={university}
                  onChangeText={setUniversity}
                  autoCorrect={false}
                  onFocus={() => setFocusedField('uni')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            <TouchableOpacity style={s.primaryButton} onPress={advance} activeOpacity={0.85}>
              <LinearGradient
                colors={[Colors.primary, Colors.primaryDeep]}
                style={s.primaryGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View style={s.primaryButtonContent}>
                  <Text style={s.primaryButtonText}>Continue</Text>
                  <AppIcon name="chevron-right" size={18} color="#FFFFFF" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Step 1: Goal Type ──────────────────────────────────────── */}
        {step === 1 && (
          <Animated.View entering={SlideInRight.duration(350)} style={s.stepContainer}>
            <View style={s.titleSection}>
              <Text style={s.stepLabel}>STEP 2 OF 3</Text>
              <Text style={s.title}>What's your goal?</Text>
              <Text style={s.subtitle}>
                Be honest — we'll set your macro targets based on this.
              </Text>
            </View>

            <View style={s.goalsGrid}>
              {GOALS.map((g) => {
                const active = goalType === g.id;
                return (
                  <TouchableOpacity
                    key={g.id}
                    style={[
                      s.goalCard,
                      active && { borderColor: g.accentColor, backgroundColor: `${g.accentColor}15` },
                    ]}
                    onPress={() => selectGoal(g.id)}
                    activeOpacity={0.8}
                  >
                    {active && (
                      <View style={[s.goalCheckBadge, { backgroundColor: g.accentColor }]}>
                        <AppIcon name="checkmark" size={12} color="#0A0A0F" strokeWidth={3} />
                      </View>
                    )}
                    {g.icon === 'flame' ? (
                      <View style={s.goalArt}><PixelFlame size={28} animated={active} /></View>
                    ) : (
                      <View style={s.goalArt}>
                        <AppIcon name={g.icon} size={28} color={active ? g.accentColor : Colors.textSecondary} />
                      </View>
                    )}
                    <Text style={[s.goalLabel, active && { color: g.accentColor }]}>{g.label}</Text>
                    <Text style={s.goalDesc}>{g.description}</Text>
                    {active && (
                      <Text style={[s.goalWhy, { color: g.accentColor }]}>{g.why}</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={s.primaryButton} onPress={advance} activeOpacity={0.85}>
              <LinearGradient
                colors={[Colors.primary, Colors.primaryDeep]}
                style={s.primaryGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View style={s.primaryButtonContent}>
                  <Text style={s.primaryButtonText}>Continue</Text>
                  <AppIcon name="chevron-right" size={18} color="#FFFFFF" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Step 2: Macro Targets ──────────────────────────────────── */}
        {step === 2 && (
          <Animated.View entering={SlideInRight.duration(350)} style={s.stepContainer}>
            <View style={s.titleSection}>
              <Text style={s.stepLabel}>STEP 3 OF 3</Text>
              <Text style={s.title}>Daily targets.</Text>
              <Text style={s.subtitle}>
                Auto-set for your goal. Fine-tune to match your body and lifestyle.
              </Text>
            </View>

            <View style={s.macroCard}>
              <MacroRow label="Calories" value={macros.calories} unit="kcal" min={1200} max={4000} color={Colors.accent} onChange={(v) => updateMacro('calories', v)} />
              <View style={s.macroDivider} />
              <MacroRow label="Protein" value={macros.protein} unit="g" min={50} max={300} color={Colors.primary} onChange={(v) => updateMacro('protein', v)} />
              <View style={s.macroDivider} />
              <MacroRow label="Carbs" value={macros.carbs} unit="g" min={50} max={500} color={Colors.gold} onChange={(v) => updateMacro('carbs', v)} />
              <View style={s.macroDivider} />
              <MacroRow label="Fat" value={macros.fats} unit="g" min={20} max={200} color={Colors.success} onChange={(v) => updateMacro('fats', v)} />
            </View>

            <View style={s.microNote}>
              <AppIcon name="idea" size={14} color={Colors.textSecondary} />
              <Text style={s.microNoteText}>
                Micronutrients (vitamins, minerals) are tracked automatically every time you log a meal — no extra setup needed.
              </Text>
            </View>

            <TouchableOpacity
              style={[s.primaryButton, saving && s.buttonDisabled]}
              onPress={advance}
              activeOpacity={0.85}
              disabled={saving}
            >
              <LinearGradient
                colors={[Colors.primary, Colors.primaryDeep]}
                style={s.primaryGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <View style={s.primaryButtonContent}>
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={s.primaryButtonText}>Let's Compete</Text>
                      <AppIcon name="trophy" size={18} color="#FFFFFF" />
                    </>
                  )}
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 48 },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  backButton: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 16,
  },
  backArrow: { color: Colors.textPrimary, fontSize: 18 },
  dotsWrapper: { flex: 1 },
  dotsCenter: { alignItems: 'center' },

  stepContainer: { gap: 20 },
  titleSection: { gap: 8, marginBottom: 4 },
  stepLabel: {
    fontFamily: FontFamily.bodyMedium, fontSize: 11,
    color: Colors.primary, letterSpacing: 2, textTransform: 'uppercase',
  },
  title: { fontFamily: FontFamily.displayBold, fontSize: 36, color: Colors.textPrimary, letterSpacing: 0.5 },
  subtitle: { fontFamily: FontFamily.body, fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },

  fieldWrapper: { gap: 8 },
  fieldLabel: {
    fontFamily: FontFamily.bodyMedium, fontSize: 12,
    color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1,
  },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 16, height: 52,
  },
  inputFocused: {
    borderColor: Colors.primary,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2, shadowRadius: 8,
  },
  input: { flex: 1, fontFamily: FontFamily.body, fontSize: 15, color: Colors.textPrimary },

  primaryButton: {
    borderRadius: 50, overflow: 'hidden',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8, marginTop: 4,
  },
  primaryGradient: { height: 54, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { fontFamily: FontFamily.bodySemiBold, fontSize: 16, color: '#FFFFFF', letterSpacing: 0.3 },
  primaryButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonDisabled: { opacity: 0.6 },

  goalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  goalCard: {
    width: (width - 48 - 12) / 2,
    backgroundColor: Colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    padding: 18, gap: 6, position: 'relative',
  },
  goalCheckBadge: {
    position: 'absolute', top: 10, right: 10,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  goalArt: { height: 34, justifyContent: 'center' },
  goalLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, color: Colors.textPrimary },
  goalDesc: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
  goalWhy: { fontFamily: FontFamily.bodyMedium, fontSize: 11, marginTop: 2, lineHeight: 15 },

  macroCard: {
    backgroundColor: Colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    padding: 20, gap: 16,
  },
  macroDivider: { height: 1, backgroundColor: Colors.border },

  microNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14,
  },
  microNoteText: {
    flex: 1,
    fontFamily: FontFamily.body, fontSize: 12,
    color: Colors.textSecondary, lineHeight: 18,
  },
});
