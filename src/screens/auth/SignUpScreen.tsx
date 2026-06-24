import React, { useState, useRef } from 'react';
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
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeOutUp,
  FadeOutDown,
  SlideInRight,
  SlideOutLeft,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Colors, FontFamily } from '../../theme';
import { signUpWithEmail, signInWithGoogle } from '../../lib/auth';
import { calculateMacros, GoalType } from '../../lib/macros';
import { updateOnboardingProfile, slugifyUsername } from '../../services/profileService';
import type { SignUpScreenProps } from '../../navigation/types';

const { width } = Dimensions.get('window');

interface GoalOption {
  id: GoalType;
  emoji: string;
  label: string;
  description: string;
  accentColor: string;
}

const GOALS: GoalOption[] = [
  { id: 'muscle', emoji: '💪', label: 'Build Muscle', description: 'High protein, caloric surplus', accentColor: Colors.primary },
  { id: 'lose_weight', emoji: '🔥', label: 'Lose Weight', description: 'Caloric deficit, lean focus', accentColor: Colors.accent },
  { id: 'eat_cleaner', emoji: '🥗', label: 'Eat Cleaner', description: 'Whole foods, balanced macros', accentColor: '#00D4FF' },
  { id: 'just_track', emoji: '📊', label: 'Just Track', description: 'No specific goal, just log', accentColor: Colors.gold },
];

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <View style={dots.row}>
      {Array.from({ length: total }, (_, i) => (
        <Animated.View
          key={i}
          style={[
            dots.dot,
            i === step
              ? dots.active
              : i < step
              ? dots.done
              : dots.inactive,
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

// ─── Macro Slider ─────────────────────────────────────────────────────────────

function MacroRow({
  label,
  value,
  unit,
  min,
  max,
  color,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  color: string;
  onChange: (v: number) => void;
}) {
  const pct = (value - min) / (max - min);

  return (
    <View style={macro.wrapper}>
      <View style={macro.labelRow}>
        <Text style={macro.label}>{label}</Text>
        <Text style={[macro.value, { color }]}>
          {value}
          <Text style={macro.unit}> {unit}</Text>
        </Text>
      </View>

      {/* Touch-based pseudo-slider */}
      <View style={macro.trackWrapper}>
        <View style={macro.track}>
          <View style={[macro.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
        </View>
        <View style={macro.buttons}>
          <TouchableOpacity
            style={macro.btn}
            onPress={() => onChange(Math.max(min, value - (label === 'Calories' ? 50 : 5)))}
          >
            <Text style={macro.btnText}>−</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={macro.btn}
            onPress={() => onChange(Math.min(max, value + (label === 'Calories' ? 50 : 5)))}
          >
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
  value: { fontFamily: FontFamily.displayBold, fontSize: 22 },
  unit: { fontFamily: FontFamily.body, fontSize: 13, color: Colors.textSecondary },
  trackWrapper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { flex: 1, height: 6, backgroundColor: Colors.surface2, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  buttons: { flexDirection: 'row', gap: 6 },
  btn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: Colors.surface2,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  btnText: { color: Colors.textPrimary, fontSize: 18, lineHeight: 22 },
});

// ─── Checkmark Animation ──────────────────────────────────────────────────────

function SuccessCheck() {
  const scale = useSharedValue(0);
  const ring = useSharedValue(0);

  React.useEffect(() => {
    scale.value = withSpring(1, { damping: 10, stiffness: 180 });
    ring.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) });
  }, []);

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0, 0.5, 1], [1, 0.6, 0]),
    transform: [{ scale: interpolate(ring.value, [0, 1], [1, 2.2]) }],
  }));

  return (
    <View style={check.container}>
      <Animated.View style={[check.ring, ringStyle]} />
      <Animated.View style={[check.circle, circleStyle]}>
        <Text style={check.checkmark}>✓</Text>
      </Animated.View>
      <Text style={check.title}>You're in!</Text>
      <Text style={check.sub}>MacroLeague is ready.{'\n'}Time to compete.</Text>
    </View>
  );
}
const check = StyleSheet.create({
  container: { alignItems: 'center', gap: 16, paddingVertical: 24 },
  ring: {
    position: 'absolute', top: 0, width: 80, height: 80,
    borderRadius: 40, borderWidth: 2, borderColor: Colors.primary,
  },
  circle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 20, elevation: 12,
  },
  checkmark: { color: '#0A0A0F', fontSize: 40, fontWeight: '700' },
  title: { fontFamily: FontFamily.displayBold, fontSize: 36, color: Colors.textPrimary, letterSpacing: 1 },
  sub: { fontFamily: FontFamily.body, fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SignUpScreen({ navigation }: SignUpScreenProps) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0); // 0=creds, 1=name/uni, 2=goal, 3=macros, then success

  // Step 0 — credentials
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Step 1 — profile
  const [name, setName] = useState('');
  const [university, setUniversity] = useState('Rutgers University');

  // Step 2 — goal
  const [goalType, setGoalType] = useState<GoalType>('muscle');

  // Step 3 — macros (auto-populated from goal)
  const [macros, setMacros] = useState(calculateMacros('muscle'));

  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // When goal changes, recalculate macros
  function selectGoal(g: GoalType) {
    setGoalType(g);
    setMacros(calculateMacros(g));
  }

  function updateMacro(key: keyof typeof macros, value: number) {
    setMacros((prev) => ({ ...prev, [key]: value }));
  }

  function validateStep(): boolean {
    if (step === 0) {
      if (!email.trim() || !email.includes('@')) {
        Alert.alert('Enter a valid email');
        return false;
      }
      if (password.length < 6) {
        Alert.alert('Password must be at least 6 characters');
        return false;
      }
    }
    if (step === 1 && !name.trim()) {
      Alert.alert('Enter your name');
      return false;
    }
    return true;
  }

  function nextStep() {
    if (!validateStep()) return;
    if (step < 3) setStep((s) => (s + 1) as any);
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      const authData = await signUpWithEmail(email.trim(), password);
      if (authData.user) {
        await updateOnboardingProfile(authData.user.id, {
          username: slugifyUsername(name || email.split('@')[0]),
          goalCalories: macros.calories,
          goalProteinG: macros.protein,
          goalCarbsG: macros.carbs,
          goalUnsaturatedFatG: macros.fats,
        });
      }
      setDone(true);
    } catch (err: any) {
      Alert.alert('Sign Up Failed', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignUp() {
    setLoading(true);
    try {
      await signInWithGoogle();
      // Auth state listener in App.tsx handles navigation
    } catch (err: any) {
      if (!err.message?.includes('cancelled')) {
        Alert.alert('Error', err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <LinearGradient colors={['#0A0A0F', '#0D0D18', '#0A0A0F']} style={StyleSheet.absoluteFill} />
        <Animated.View entering={FadeInDown.duration(500)} style={styles.successWrapper}>
          <SuccessCheck />
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={async () => {
              // If Supabase auto-confirmed, auth listener already logged us in.
              // If not, manually trigger login with demo data as fallback.
              const { useUserStore } = require('../../store/userStore');
              if (!useUserStore.getState().isAuthenticated) {
                useUserStore.getState().login();
              }
            }}
          >
            <LinearGradient colors={[Colors.primary, '#00C96A']} style={styles.primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={styles.primaryButtonText}>Let's Go →</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />
      <LinearGradient colors={['#0A0A0F', '#0D0D18', '#0A0A0F']} style={StyleSheet.absoluteFill} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header row */}
        <View style={styles.topRow}>
          <TouchableOpacity
            onPress={() => (step === 0 ? navigation.goBack() : setStep((s) => (s - 1) as any))}
            style={styles.backButton}
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>

          {step > 0 && (
            <StepDots step={step - 1} total={3} />
          )}

          {step > 0 && step < 3 && (
            <TouchableOpacity onPress={() => { if (step === 3) { handleSubmit(); } else nextStep(); }}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          )}
          {(step === 0 || step === 3) && <View style={{ width: 48 }} />}
        </View>

        {/* ── STEP 0: Email + Password ─────────────────────────────── */}
        {step === 0 && (
          <Animated.View entering={SlideInRight.duration(350)} style={styles.stepContainer}>
            <View style={styles.titleSection}>
              <Text style={styles.title}>Create account.</Text>
              <Text style={styles.subtitle}>Join the league and start competing.</Text>
            </View>

            {/* Google */}
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignUp}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={Colors.textPrimary} />
              ) : (
                <>
                  <View style={styles.googleIcon}>
                    <Text style={styles.googleG}>G</Text>
                  </View>
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Email */}
            <View style={styles.fieldWrapper}>
              <Text style={styles.fieldLabel}>Email</Text>
              <View style={[styles.inputContainer, focusedField === 'email' && styles.inputFocused]}>
                <TextInput
                  style={styles.input}
                  placeholder="your@email.com"
                  placeholderTextColor={Colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldWrapper}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View style={[styles.inputContainer, focusedField === 'password' && styles.inputFocused]}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Min. 6 characters"
                  placeholderTextColor={Colors.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                  <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={nextStep} activeOpacity={0.85}>
              <LinearGradient colors={[Colors.primary, '#00C96A']} style={styles.primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={styles.primaryButtonText}>Continue →</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.signInRow} onPress={() => navigation.navigate('SignIn')}>
              <Text style={styles.signInPrompt}>Already have an account? </Text>
              <Text style={styles.signInLink}>Sign in</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── STEP 1: Name + University ────────────────────────────── */}
        {step === 1 && (
          <Animated.View entering={SlideInRight.duration(350)} style={styles.stepContainer}>
            <View style={styles.titleSection}>
              <Text style={styles.stepLabel}>STEP 1 OF 3</Text>
              <Text style={styles.title}>Who are you?</Text>
              <Text style={styles.subtitle}>Let your teammates know who they're competing with.</Text>
            </View>

            <View style={styles.fieldWrapper}>
              <Text style={styles.fieldLabel}>Your Name</Text>
              <View style={[styles.inputContainer, focusedField === 'name' && styles.inputFocused]}>
                <TextInput
                  style={styles.input}
                  placeholder="First name or username"
                  placeholderTextColor={Colors.textSecondary}
                  value={name}
                  onChangeText={setName}
                  autoCorrect={false}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            <View style={styles.fieldWrapper}>
              <Text style={styles.fieldLabel}>University</Text>
              <View style={[styles.inputContainer, focusedField === 'uni' && styles.inputFocused]}>
                <TextInput
                  style={styles.input}
                  placeholder="Your university"
                  placeholderTextColor={Colors.textSecondary}
                  value={university}
                  onChangeText={setUniversity}
                  autoCorrect={false}
                  onFocus={() => setFocusedField('uni')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
              <Text style={styles.hint}>🏫 Pre-filled for Rutgers — change if needed</Text>
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={nextStep} activeOpacity={0.85}>
              <LinearGradient colors={[Colors.primary, '#00C96A']} style={styles.primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={styles.primaryButtonText}>Continue →</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── STEP 2: Goal Selection ───────────────────────────────── */}
        {step === 2 && (
          <Animated.View entering={SlideInRight.duration(350)} style={styles.stepContainer}>
            <View style={styles.titleSection}>
              <Text style={styles.stepLabel}>STEP 2 OF 3</Text>
              <Text style={styles.title}>What's your goal?</Text>
              <Text style={styles.subtitle}>We'll auto-set your macro targets. You can adjust anytime.</Text>
            </View>

            <View style={styles.goalsGrid}>
              {GOALS.map((g) => {
                const active = goalType === g.id;
                return (
                  <TouchableOpacity
                    key={g.id}
                    style={[
                      styles.goalCard,
                      active && { borderColor: g.accentColor, backgroundColor: `${g.accentColor}15` },
                    ]}
                    onPress={() => selectGoal(g.id)}
                    activeOpacity={0.8}
                  >
                    {active && (
                      <View style={[styles.goalCheckBadge, { backgroundColor: g.accentColor }]}>
                        <Text style={styles.goalCheck}>✓</Text>
                      </View>
                    )}
                    <Text style={styles.goalEmoji}>{g.emoji}</Text>
                    <Text style={[styles.goalLabel, active && { color: g.accentColor }]}>{g.label}</Text>
                    <Text style={styles.goalDesc}>{g.description}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={nextStep} activeOpacity={0.85}>
              <LinearGradient colors={[Colors.primary, '#00C96A']} style={styles.primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={styles.primaryButtonText}>Continue →</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── STEP 3: Macro Targets ────────────────────────────────── */}
        {step === 3 && (
          <Animated.View entering={SlideInRight.duration(350)} style={styles.stepContainer}>
            <View style={styles.titleSection}>
              <Text style={styles.stepLabel}>STEP 3 OF 3</Text>
              <Text style={styles.title}>Daily targets.</Text>
              <Text style={styles.subtitle}>Auto-set for your goal. Fine-tune to match your body.</Text>
            </View>

            <View style={styles.macroCard}>
              <MacroRow
                label="Calories"
                value={macros.calories}
                unit="kcal"
                min={1200}
                max={4000}
                color={Colors.accent}
                onChange={(v) => updateMacro('calories', v)}
              />
              <View style={styles.macroDivider} />
              <MacroRow
                label="Protein"
                value={macros.protein}
                unit="g"
                min={50}
                max={300}
                color={Colors.primary}
                onChange={(v) => updateMacro('protein', v)}
              />
              <View style={styles.macroDivider} />
              <MacroRow
                label="Carbs"
                value={macros.carbs}
                unit="g"
                min={50}
                max={500}
                color="#00D4FF"
                onChange={(v) => updateMacro('carbs', v)}
              />
              <View style={styles.macroDivider} />
              <MacroRow
                label="Fats"
                value={macros.fats}
                unit="g"
                min={20}
                max={200}
                color={Colors.gold}
                onChange={(v) => updateMacro('fats', v)}
              />
            </View>

            <Text style={styles.macroNote}>You can edit these anytime in your profile settings.</Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient colors={[Colors.primary, '#00C96A']} style={styles.primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {loading ? (
                  <ActivityIndicator color="#0A0A0F" />
                ) : (
                  <Text style={styles.primaryButtonText}>Join MacroLeague 🏆</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 48 },
  successWrapper: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 32 },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  backButton: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { color: Colors.textPrimary, fontSize: 18 },
  skipText: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.textSecondary },

  stepContainer: { gap: 20 },
  titleSection: { gap: 8, marginBottom: 4 },
  stepLabel: {
    fontFamily: FontFamily.bodyMedium, fontSize: 11,
    color: Colors.primary, letterSpacing: 2, textTransform: 'uppercase',
  },
  title: { fontFamily: FontFamily.displayBold, fontSize: 38, color: Colors.textPrimary, letterSpacing: 0.5 },
  subtitle: { fontFamily: FontFamily.body, fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  hint: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.textSecondary, marginTop: 4 },

  // Form
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
  eyeButton: { padding: 4 },
  eyeIcon: { fontSize: 16 },

  // Google
  googleButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 50, height: 54, gap: 10,
  },
  googleIcon: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  googleG: { fontFamily: FontFamily.bodySemiBold, fontSize: 14, color: '#4285F4' },
  googleButtonText: { fontFamily: FontFamily.bodyMedium, fontSize: 15, color: Colors.textPrimary },

  // Divider
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontFamily: FontFamily.body, fontSize: 13, color: Colors.textSecondary },

  // Primary button
  primaryButton: {
    borderRadius: 50, overflow: 'hidden',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8, marginTop: 4,
  },
  primaryGradient: { height: 54, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { fontFamily: FontFamily.bodySemiBold, fontSize: 16, color: '#0A0A0F', letterSpacing: 0.3 },

  // Sign in link
  signInRow: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 4 },
  signInPrompt: { fontFamily: FontFamily.body, fontSize: 14, color: Colors.textSecondary },
  signInLink: { fontFamily: FontFamily.bodySemiBold, fontSize: 14, color: Colors.primary },

  // Goal grid
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
  goalCheck: { color: '#0A0A0F', fontSize: 11, fontWeight: '700' },
  goalEmoji: { fontSize: 28 },
  goalLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, color: Colors.textPrimary },
  goalDesc: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },

  // Macro card
  macroCard: {
    backgroundColor: Colors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    padding: 20, gap: 16,
  },
  macroDivider: { height: 1, backgroundColor: Colors.border },
  macroNote: {
    fontFamily: FontFamily.body, fontSize: 12,
    color: Colors.textSecondary, textAlign: 'center', lineHeight: 18,
  },
});
