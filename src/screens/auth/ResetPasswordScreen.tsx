import React, { useState } from 'react';
import { View, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Type, useTheme } from '../../theme';
import { Screen, Text, Button, TextField } from '../../components/ui';
import { updatePassword, signOut } from '../../lib/auth';

// The Supabase project password policy is the real authority; this is a fast
// friendly pre-check that mirrors sign-up.
const MIN_PASSWORD_LENGTH = 6;

/**
 * Shown when the user arrives in a temporary recovery session (App.tsx renders
 * this on PASSWORD_RECOVERY). On success it signs out so the user logs in fresh.
 */
export default function ResetPasswordScreen({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (loading) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Both passwords must match.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await updatePassword(password);
      await signOut().catch(() => {});
      Alert.alert('Password updated', 'Please sign in with your new password.');
      onDone();
    } catch (err: any) {
      setError(err?.message ?? 'Could not update password.');
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
        <View style={{ marginTop: 22 }}>
          <Text style={[Type.titleSm, { color: colors.ink }]}>New password</Text>
          <Text variant="body" color={colors.textSecondary} style={{ marginTop: 8 }}>
            Choose a new password for your account.
          </Text>
        </View>

        <View style={{ marginTop: 26, gap: 12 }}>
          <TextField
            label="New password"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              if (error) setError(null);
            }}
            secure
            autoComplete="password-new"
            textContentType="newPassword"
          />
          <TextField
            label="Confirm password"
            value={confirm}
            onChangeText={(t) => {
              setConfirm(t);
              if (error) setError(null);
            }}
            error={error}
            secure
            autoComplete="password-new"
            textContentType="newPassword"
          />
        </View>

        <View style={{ marginTop: 22 }}>
          <Button label="Update password" loading={loading} loadingLabel="Updating…" onPress={handleSave} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
