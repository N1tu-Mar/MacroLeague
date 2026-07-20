import React, { useState } from 'react';
import { View, Alert } from 'react-native';
import { useTheme } from '../../theme';
import { Screen, ScreenHeader, Text, Button, TextField, Card, AppIcon } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { updatePassword } from '../../lib/auth';
import { reportError } from '../../lib/monitoring';
import { toUserFacingMessage } from '../../lib/errors';

/**
 * Change your password while signed in.
 *
 * WHY THIS EXISTS: updatePassword() was only reachable from the emailed
 * recovery link. A signed-in user who simply wanted to rotate their password —
 * or who suspected someone had seen it — had no way to do so without logging
 * themselves out and going through "forgot password".
 *
 * CURRENT-PASSWORD RE-AUTH: Supabase's updateUser({ password }) does not
 * require the old password, so on its own this screen would let anyone holding
 * an unlocked phone change the password and lock the real owner out. We verify
 * the current password first by re-signing-in with it. That call returns a fresh
 * session for the SAME user, so it does not disturb the current session.
 */

const MIN_LENGTH = 6;

export default function ChangePasswordScreen({ navigation }: any) {
  const { colors } = useTheme();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [currentError, setCurrentError] = useState<string | null>(null);
  const [newError, setNewError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;

    let ok = true;
    if (!currentPassword) {
      setCurrentError('Enter your current password.');
      ok = false;
    } else setCurrentError(null);

    if (newPassword.length < MIN_LENGTH) {
      setNewError(`Use at least ${MIN_LENGTH} characters.`);
      ok = false;
    } else if (newPassword === currentPassword) {
      setNewError('Choose a password different from your current one.');
      ok = false;
    } else setNewError(null);

    if (confirmPassword !== newPassword) {
      setConfirmError('Passwords do not match.');
      ok = false;
    } else setConfirmError(null);

    if (!ok) return;

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email;
      if (!email) {
        // Google/Apple accounts have no password to change.
        throw new Error(
          'This account signs in with Google or Apple, so it has no password to change.',
        );
      }

      // Re-authenticate. A wrong current password fails HERE, before anything
      // is changed — this is the whole point of the screen's security model.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reauthError) {
        setCurrentError('That password is incorrect.');
        setSaving(false);
        return;
      }

      await updatePassword(newPassword);

      Alert.alert('Password updated', 'Your password has been changed.');
      navigation.goBack();
    } catch (err) {
      reportError(err, { where: 'ChangePasswordScreen.save' });
      Alert.alert(
        'Could not change password',
        toUserFacingMessage(err, 'Please try again.'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll bottomSpace={110}>
      <ScreenHeader title="Change password" onBack={() => navigation.goBack()} />

      <Card style={{ marginTop: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <AppIcon name="info" size={16} color={colors.textSecondary} />
        <Text variant="labelSm" color={colors.textSecondary} style={{ flex: 1, lineHeight: 18 }}>
          You'll stay signed in on this device. Other devices will need the new
          password next time they sign in.
        </Text>
      </Card>

      <View style={{ marginTop: 18, gap: 12 }}>
        <TextField
          label="Current password"
          value={currentPassword}
          onChangeText={(t) => {
            setCurrentPassword(t);
            if (currentError) setCurrentError(null);
          }}
          error={currentError}
          secure
          autoComplete="password"
          textContentType="password"
        />
        <TextField
          label="New password"
          value={newPassword}
          onChangeText={(t) => {
            setNewPassword(t);
            if (newError) setNewError(null);
          }}
          error={newError}
          secure
          autoComplete="password-new"
          textContentType="newPassword"
        />
        <TextField
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={(t) => {
            setConfirmPassword(t);
            if (confirmError) setConfirmError(null);
          }}
          error={confirmError}
          secure
          autoComplete="password-new"
          textContentType="newPassword"
        />
      </View>

      <Button
        label={saving ? 'Updating…' : 'Update password'}
        loading={saving}
        loadingLabel="Updating…"
        disabled={saving}
        onPress={save}
        fullWidth
        style={{ marginTop: 22 }}
      />
    </Screen>
  );
}
