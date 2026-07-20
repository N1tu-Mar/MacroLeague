import React, { useState } from 'react';
import { View, Alert } from 'react-native';
import { useTheme, Radius } from '../../theme';
import { Screen, Text, Button, AppIcon } from '../../components/ui';
import { useUserStore } from '../../store/userStore';
import { reactivateAccount } from '../../services/accountService';
import { signOut } from '../../lib/auth';
import { toUserFacingMessage } from '../../lib/errors';

/**
 * Full-screen gate shown (instead of the main app) when the signed-in account is
 * archived for deletion. The user can either recover the account or sign out. Once
 * the recovery window passes, the account is permanently purged server-side and the
 * user can no longer reach this screen (they can't sign in).
 */
export default function ReactivateAccountScreen() {
  const { colors } = useTheme();
  const deletionScheduledAt = useUserStore((s) => s.deletionScheduledAt);
  const setAccountLifecycle = useUserStore((s) => s.setAccountLifecycle);
  const logout = useUserStore((s) => s.logout);
  const [busy, setBusy] = useState(false);

  const whenText = deletionScheduledAt
    ? new Date(deletionScheduledAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  async function onReactivate() {
    setBusy(true);
    try {
      await reactivateAccount();
      // Clearing the local flag drops the gate and reveals the main app.
      setAccountLifecycle(false, null);
    } catch (err) {
      Alert.alert(
        'Could not reactivate',
        toUserFacingMessage(err, 'Please try again.'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setBusy(true);
    try {
      await signOut();
    } catch {
      // fall through to local logout
    }
    logout();
  }

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: Radius.hero,
            backgroundColor: colors.streakTint,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}
        >
          <AppIcon name="hourglass" size={36} color={colors.streak} />
        </View>

        <Text variant="title" color={colors.ink} center style={{ marginBottom: 14 }}>
          Account scheduled for deletion
        </Text>

        <Text variant="body" color={colors.textSecondary} center style={{ marginBottom: 12 }}>
          {whenText
            ? `Your account is archived and will be permanently deleted on ${whenText}.`
            : 'Your account is archived and scheduled for permanent deletion.'}
        </Text>
        <Text variant="body" color={colors.textSecondary} center style={{ marginBottom: 8 }}>
          Until then, nothing is gone. Reactivate to keep your streak, logs, and points
          exactly as you left them. If you didn't request this, reactivate and reset your
          password.
        </Text>
      </View>

      <View style={{ gap: 10 }}>
        <Button
          label="Reactivate account"
          onPress={onReactivate}
          loading={busy}
          loadingLabel="Reactivating…"
        />
        <Button label="Sign out" variant="ghost" onPress={onSignOut} disabled={busy} />
      </View>
    </Screen>
  );
}
