import React, { useState } from 'react';
import { View, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { FontFamily, Type, useTheme } from '../../theme';
import {
  Screen,
  Text,
  Button,
  TextField,
  ScreenHeader,
  AppIcon,
} from '../../components/ui';
import { signUpWithEmail } from '../../lib/auth';
import { checkAge } from '../../lib/ageGate';
import LegalNotice from '../../components/LegalNotice';
import type { SignUpScreenProps } from '../../navigation/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 0..3 password strength → drives the 3-segment meter (spec 2c).
function scorePassword(pw: string): { score: number; label: string } {
  if (!pw) return { score: 0, label: '' };
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10 || (/[A-Z]/.test(pw) && /[0-9]/.test(pw))) s++;
  if (pw.length >= 12 && /[^A-Za-z0-9]/.test(pw)) s++;
  const label = s <= 1 ? 'Weak' : s === 2 ? 'Good' : 'Strong';
  return { score: Math.max(1, s), label };
}

export default function SignUpScreen({ navigation }: SignUpScreenProps) {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  // Neutral age screen — see src/lib/ageGate.ts for why the threshold is never
  // shown to the user.
  const [dobMonth, setDobMonth] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [dobError, setDobError] = useState<string | null>(null);

  const strength = scorePassword(password);
  const strengthColor =
    strength.score >= 3 ? colors.success : strength.score === 2 ? colors.success : colors.streak;

  async function handleContinue() {
    if (loading) return;
    let ok = true;
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError('Enter a valid email address.');
      ok = false;
    } else setEmailError(null);
    if (password.length < 6) {
      setPwError('Use at least 6 characters.');
      ok = false;
    } else setPwError(null);

    // Age gate. Runs BEFORE signUpWithEmail so an underage account is never
    // created in the first place — rejecting after creation would leave an
    // orphaned auth user behind.
    const age = checkAge(dobMonth, dobDay, dobYear);
    if (age.status === 'incomplete') {
      setDobError('Enter your date of birth.');
      ok = false;
    } else if (age.status === 'invalid' || age.status === 'underage') {
      setDobError(age.message);
      ok = false;
    } else {
      setDobError(null);
    }

    if (!ok) return;

    setLoading(true);
    try {
      const authData = await signUpWithEmail(email.trim(), password);
      // With a session, App.tsx's needsOnboarding gate takes over and shows the
      // 4-step onboarding. Without one (email-confirmation mode), tell the user.
      if (!authData.session) setCheckEmail(true);
    } catch (err: any) {
      setPwError(err?.message ?? 'Could not create your account.');
    } finally {
      setLoading(false);
    }
  }

  if (checkEmail) {
    return (
      <Screen padded>
        <ScreenHeader onBack={() => navigation.navigate('SignIn')} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              backgroundColor: colors.successTint,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon name="bell" size={28} color={colors.success} />
          </View>
          <Text variant="titleSm" color={colors.ink} center>Check your email</Text>
          <Text variant="body" color={colors.textSecondary} center style={{ maxWidth: 300 }}>
            We sent a confirmation link to {email.trim()}. Confirm it, then sign in to set up your league.
          </Text>
        </View>
        <Button label="Go to sign in" onPress={() => navigation.navigate('SignIn')} />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen scroll padded>
        <ScreenHeader onBack={() => navigation.goBack()} />
        <Animated.View entering={FadeInDown.delay(60).duration(400)}>
          <Text style={[Type.titleSm, { color: colors.ink, marginTop: 22 }]}>Create your account</Text>
          <Text variant="body" color={colors.textSecondary} style={{ marginTop: 8 }}>
            You'll set your league identity in the next step.
          </Text>
        </Animated.View>

        <View style={{ marginTop: 26, gap: 12 }}>
          <TextField
            label="Email"
            placeholder="you@university.edu"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (emailError) setEmailError(null);
            }}
            error={emailError}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
          />
          <View>
            <TextField
              label="Password"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (pwError) setPwError(null);
              }}
              error={pwError}
              secure
              autoComplete="password-new"
              textContentType="newPassword"
            />
            {password.length > 0 && !pwError ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7, paddingHorizontal: 2 }}>
                {[0, 1, 2].map((i) => (
                  <View
                    key={i}
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: i < strength.score ? strengthColor : colors.track,
                    }}
                  />
                ))}
                <Text color={strengthColor} variant="labelSm" style={{ marginLeft: 4 }}>
                  {strength.label}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Date of birth. Three short numeric fields rather than a date picker
              so it behaves identically on iOS, Android and web, and so nothing
              is pre-filled with a value that would pass the gate by default. */}
          <View>
            <Text variant="labelSm" color={colors.textSecondary} style={{ marginBottom: 6, paddingHorizontal: 2 }}>
              Date of birth
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextField
                label="MM"
                value={dobMonth}
                onChangeText={(t) => {
                  setDobMonth(t.replace(/[^0-9]/g, '').slice(0, 2));
                  if (dobError) setDobError(null);
                }}
                keyboardType="number-pad"
                accessibilityLabel="Birth month"
                style={{ flex: 1 }}
              />
              <TextField
                label="DD"
                value={dobDay}
                onChangeText={(t) => {
                  setDobDay(t.replace(/[^0-9]/g, '').slice(0, 2));
                  if (dobError) setDobError(null);
                }}
                keyboardType="number-pad"
                accessibilityLabel="Birth day"
                style={{ flex: 1 }}
              />
              <TextField
                label="YYYY"
                value={dobYear}
                onChangeText={(t) => {
                  setDobYear(t.replace(/[^0-9]/g, '').slice(0, 4));
                  if (dobError) setDobError(null);
                }}
                keyboardType="number-pad"
                accessibilityLabel="Birth year"
                style={{ flex: 1.4 }}
              />
            </View>
            {dobError ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, paddingHorizontal: 2 }}>
                <AppIcon name="circle-alert" size={14} color={colors.error} />
                <Text variant="label" color={colors.error} style={{ flex: 1 }}>
                  {dobError}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={{ marginTop: 22 }}>
          <Button
            label="Continue"
            loading={loading}
            loadingLabel="Creating account…"
            onPress={handleContinue}
          />
        </View>

        <View style={{ height: 24 }} />
        <Pressable
          onPress={() => navigation.navigate('SignIn')}
          style={{ alignItems: 'center', paddingVertical: 8 }}
        >
          <Text color={colors.textSecondary}>
            Already have an account?{' '}
            <Text color={colors.scarlet} style={{ fontFamily: FontFamily.semibold }}>Sign in</Text>
          </Text>
        </Pressable>
        <View style={{ marginTop: 8 }}>
          <LegalNotice />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
