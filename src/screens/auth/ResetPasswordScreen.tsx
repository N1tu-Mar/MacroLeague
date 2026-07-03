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
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Colors, FontFamily } from '../../theme';
import { updatePassword, signOut } from '../../lib/auth';
import AppIcon from '../../components/ui/AppIcon';

// Mirrors the sign-up client policy. The Supabase project password policy is the
// real authority; this is a fast, friendly pre-check.
const MIN_PASSWORD_LENGTH = 6;

/**
 * Shown when the user arrives in a temporary recovery session after following a
 * password-reset link (App.tsx renders this on the PASSWORD_RECOVERY event).
 * On success it signs out so the user logs in fresh with the new password.
 */
export default function ResetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (loading) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      Alert.alert('Password too short', `Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords do not match', 'Please re-enter the same password in both fields.');
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      // Force a fresh sign-in with the new password so the recovery session
      // isn't silently kept as a normal session.
      await signOut().catch(() => {});
      Alert.alert('Password updated', 'Please sign in with your new password.');
      onDone();
    } catch (err: any) {
      Alert.alert('Could not update password', err?.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
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
        <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.titleSection}>
          <Text style={styles.title}>New password.</Text>
          <Text style={styles.subtitle}>Choose a new password for your account.</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.formSection}>
          <View style={styles.fieldWrapper}>
            <Text style={styles.fieldLabel}>New password</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="••••••••"
                placeholderTextColor={Colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                returnKeyType="next"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                <AppIcon name={showPassword ? 'eye-off' : 'eye'} size={18} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.fieldWrapper}>
            <Text style={styles.fieldLabel}>Confirm password</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="••••••••"
                placeholderTextColor={Colors.textSecondary}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[Colors.primary, '#00C96A']}
              style={styles.primaryGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {loading ? (
                <ActivityIndicator color="#0A0A0F" />
              ) : (
                <Text style={styles.primaryButtonText}>Update password</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    paddingBottom: 40,
  },
  titleSection: { marginBottom: 36, gap: 8 },
  title: { fontFamily: FontFamily.displayBold, fontSize: 40, color: Colors.textPrimary, letterSpacing: 0.5 },
  subtitle: { fontFamily: FontFamily.body, fontSize: 15, color: Colors.textSecondary, lineHeight: 22 },
  formSection: { gap: 18, marginBottom: 24 },
  fieldWrapper: { gap: 8 },
  fieldLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    height: 52,
  },
  input: { flex: 1, fontFamily: FontFamily.body, fontSize: 15, color: Colors.textPrimary },
  eyeButton: { padding: 4 },
  primaryButton: {
    borderRadius: 50,
    overflow: 'hidden',
    marginTop: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryGradient: { height: 54, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    color: '#0A0A0F',
    letterSpacing: 0.3,
  },
});
