import React, { useState } from 'react';
import { View, KeyboardAvoidingView, Platform } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Type, useTheme } from '../../theme';
import { Screen, Text, Button, TextField, ScreenHeader, AppIcon } from '../../components/ui';
import { sendPasswordReset } from '../../lib/auth';
import type { ForgotPasswordScreenProps } from '../../navigation/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen({ navigation }: ForgotPasswordScreenProps) {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (loading) return;
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Enter the email address for your account.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await sendPasswordReset(trimmed);
      setSent(true); // never reveal whether an account exists
    } catch {
      setSent(true);
    } finally {
      setLoading(false);
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
          <Text style={[Type.titleSm, { color: colors.ink, marginTop: 22 }]}>Reset password</Text>
          <Text variant="body" color={colors.textSecondary} style={{ marginTop: 8 }}>
            {sent
              ? "If an account exists for that email, we've sent a reset link."
              : "Enter your email and we'll send you a reset link."}
          </Text>
        </Animated.View>

        {sent ? (
          <View style={{ marginTop: 26, alignItems: 'center', gap: 16 }}>
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
              <AppIcon name="checkmark" size={30} color={colors.success} strokeWidth={2.5} />
            </View>
            <Button label="Back to sign in" variant="secondary" onPress={() => navigation.goBack()} />
          </View>
        ) : (
          <>
            <View style={{ marginTop: 26 }}>
              <TextField
                label="Email"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (error) setError(null);
                }}
                error={error}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="send"
                onSubmitEditing={handleSend}
              />
            </View>
            <View style={{ marginTop: 22, gap: 10 }}>
              <Button label="Send reset link" loading={loading} loadingLabel="Sending…" onPress={handleSend} />
              <Button label="Back to sign in" variant="ghost" onPress={() => navigation.goBack()} />
            </View>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
