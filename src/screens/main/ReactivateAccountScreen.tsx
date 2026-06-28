import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Colors, FontFamily } from '../../theme';
import { useUserStore } from '../../store/userStore';
import { reactivateAccount } from '../../services/accountService';
import { signOut } from '../../lib/auth';
import AppIcon from '../../components/ui/AppIcon';

/**
 * Full-screen gate shown (instead of the main app) when the signed-in account is
 * archived for deletion. The user can either recover the account or sign out. Once
 * the recovery window passes, the account is permanently purged server-side and the
 * user can no longer reach this screen (they can't sign in).
 */
export default function ReactivateAccountScreen() {
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
        err instanceof Error ? err.message : 'Please try again.',
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
    <View style={styles.container}>
      <View style={styles.statusIcon}>
        <AppIcon name="hourglass" size={42} color={Colors.accent} />
      </View>
      <Text style={styles.title}>Account scheduled for deletion</Text>
      <Text style={styles.body}>
        {whenText
          ? `Your account is archived and will be permanently deleted on ${whenText}.`
          : 'Your account is archived and scheduled for permanent deletion.'}
      </Text>
      <Text style={styles.body}>
        Until then, nothing is gone. Reactivate to keep your streak, logs, and points
        exactly as you left them. If you didn't request this, reactivate and reset your
        password.
      </Text>

      <TouchableOpacity
        style={[styles.primaryBtn, busy && styles.disabled]}
        onPress={onReactivate}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={Colors.background} />
        ) : (
          <Text style={styles.primaryText}>REACTIVATE MY ACCOUNT</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryBtn} onPress={onSignOut} disabled={busy}>
        <Text style={styles.secondaryText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  statusIcon: { marginBottom: 16 },
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: 22,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 14,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 50,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 14,
  },
  primaryText: { fontFamily: FontFamily.displayBold, fontSize: 15, color: Colors.background },
  disabled: { opacity: 0.6 },
  secondaryBtn: { paddingVertical: 16, alignItems: 'center' },
  secondaryText: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.textSecondary },
});
