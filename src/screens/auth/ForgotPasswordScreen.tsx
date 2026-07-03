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
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Colors, FontFamily } from '../../theme';
import { sendPasswordReset } from '../../lib/auth';
import type { ForgotPasswordScreenProps } from '../../navigation/types';
import AppIcon from '../../components/ui/AppIcon';

export default function ForgotPasswordScreen({ navigation }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (loading) return;
    const trimmed = email.trim();
    // Basic shape check; the server is the real authority.
    if (!trimmed || !trimmed.includes('@') || !trimmed.includes('.')) {
      Alert.alert('Enter your email', 'Please enter the email address for your account.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordReset(trimmed);
      // Always report success — we never reveal whether an account exists.
      setSent(true);
    } catch (err: any) {
      Alert.alert('Something went wrong', err?.message ?? 'Please try again.');
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
        <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <AppIcon name="back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.titleSection}>
          <Text style={styles.title}>Reset password.</Text>
          <Text style={styles.subtitle}>
            {sent
              ? "If an account exists for that email, we've sent a link to reset your password. Check your inbox (and spam)."
              : "Enter your account email and we'll send you a link to set a new password."}
          </Text>
        </Animated.View>

        {!sent && (
          <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.formSection}>
            <View style={styles.fieldWrapper}>
              <Text style={styles.fieldLabel}>Email</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="your@email.com"
                  placeholderTextColor={Colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleSend}
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleSend}
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
                  <Text style={styles.primaryButtonText}>Send reset link</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}

        <Animated.View entering={FadeInUp.delay(300).duration(600)} style={styles.backRow}>
          <TouchableOpacity onPress={() => navigation.navigate('SignIn')}>
            <Text style={styles.backLink}>Back to sign in</Text>
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
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
  },
  header: { marginBottom: 32 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
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
  backRow: { flexDirection: 'row', justifyContent: 'center' },
  backLink: { fontFamily: FontFamily.bodySemiBold, fontSize: 14, color: Colors.primary },
});
