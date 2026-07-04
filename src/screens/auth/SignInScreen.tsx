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
import { signInWithEmail, signInWithGoogle, signInWithApple } from '../../lib/auth';

// Sign in with Apple is required on iOS (Guideline 4.8) and works on web via
// Supabase OAuth; Android stays Google-only (no native Apple, avoids extra config).
const SHOW_APPLE = Platform.OS !== 'android';
import type { SignInScreenProps } from '../../navigation/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Inline auth-error banner (spec 2b). */
function AuthErrorBanner({ message }: { message: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
        backgroundColor: colors.brandTint,
        borderWidth: 1,
        borderColor: colors.brandTintBorder,
        borderRadius: 14,
        padding: 12,
        marginBottom: 4,
      }}
    >
      <AppIcon name="circle-alert" size={18} color={colors.errorDeep} />
      <View style={{ flex: 1 }}>
        <Text color={colors.errorDeep} style={{ fontFamily: FontFamily.semibold, fontSize: 13.5 }}>
          That email and password don't match.
        </Text>
        <Text color={colors.errorMuted} variant="label" style={{ marginTop: 2 }}>
          {message}
        </Text>
      </View>
    </View>
  );
}

export default function SignInScreen({ navigation }: SignInScreenProps) {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const busy = loading || googleLoading || appleLoading;

  async function handleSignIn() {
    if (busy) return;
    setAuthError(null);
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError(null);
    if (!password) return;
    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
      // Auth state listener in App.tsx handles navigation
    } catch {
      setAuthError('Try again, or reset your password. Your fields are kept as typed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (busy) return;
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch {
      // cancellation isn't worth surfacing
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleApple() {
    if (busy) return;
    setAppleLoading(true);
    try {
      await signInWithApple();
      // Auth state listener in App.tsx handles navigation
    } catch {
      // cancellation isn't worth surfacing
    } finally {
      setAppleLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen scroll padded>
        <ScreenHeader onBack={() => navigation.goBack()} />
        <Animated.View entering={FadeInDown.delay(60).duration(400)}>
          <Text style={[Type.titleSm, { color: colors.ink, marginTop: 22 }]}>Welcome back</Text>
          <Text variant="body" color={colors.textSecondary} style={{ marginTop: 8 }}>
            Keep your streak and league progress moving.
          </Text>
        </Animated.View>

        <View style={{ marginTop: 26, gap: 12 }}>
          {authError ? <AuthErrorBanner message={authError} /> : null}
          <TextField
            label="Email"
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
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secure
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={handleSignIn}
          />
          <Pressable
            onPress={() => navigation.navigate('ForgotPassword')}
            style={{ alignSelf: 'flex-end', paddingTop: 2 }}
          >
            <Text color={colors.scarlet} style={{ fontFamily: FontFamily.semibold, fontSize: 13.5 }}>
              Forgot password?
            </Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 22, gap: 10 }}>
          <Button
            label="Sign in"
            loading={loading}
            loadingLabel="Signing in…"
            onPress={handleSignIn}
          />
          {SHOW_APPLE && (
            <Button
              label="Continue with Apple"
              variant="apple"
              size="md"
              loading={appleLoading}
              loadingLabel="Connecting…"
              onPress={handleApple}
            />
          )}
          <Button
            label="Continue with Google"
            variant="google"
            size="md"
            loading={googleLoading}
            loadingLabel="Connecting…"
            onPress={handleGoogle}
          />
        </View>

        <View style={{ height: 24 }} />
        <Pressable
          onPress={() => navigation.navigate('SignUp')}
          style={{ alignItems: 'center', paddingVertical: 8 }}
        >
          <Text color={colors.textSecondary}>
            New here?{' '}
            <Text color={colors.scarlet} style={{ fontFamily: FontFamily.semibold }}>Create an account</Text>
          </Text>
        </Pressable>
      </Screen>
    </KeyboardAvoidingView>
  );
}
