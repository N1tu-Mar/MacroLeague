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
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Colors, FontFamily } from '../../theme';
import { signInWithEmail, signInWithGoogle } from '../../lib/auth';
import type { SignInScreenProps } from '../../navigation/types';
import AppIcon from '../../components/ui/AppIcon';

export default function SignInScreen({ navigation }: SignInScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);

  // Shake animation for error
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  function shake() {
    shakeX.value = withSequence(
      withTiming(-8, { duration: 60 }),
      withTiming(8, { duration: 60 }),
      withTiming(-6, { duration: 60 }),
      withTiming(6, { duration: 60 }),
      withTiming(0, { duration: 60 })
    );
  }

  async function handleSignIn() {
    if (!email.trim() || !password) {
      shake();
      return;
    }
    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
      // Auth state listener in App.tsx handles navigation
    } catch (err: any) {
      shake();
      Alert.alert('Sign In Failed', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      // Auth state listener in App.tsx handles navigation
    } catch (err: any) {
      if (!err.message?.includes('cancelled')) {
        Alert.alert('Error', err.message);
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="light" />
      <LinearGradient
        colors={['#0A0A0F', '#0D0D18', '#0A0A0F']}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <AppIcon name="back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </Animated.View>

        {/* Heading */}
        <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.titleSection}>
          <Text style={styles.title}>Welcome back.</Text>
          <Text style={styles.subtitle}>Sign in to keep your streak alive.</Text>
        </Animated.View>

        {/* Form */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(600)}
          style={[styles.formSection, shakeStyle]}
        >
          {/* Email */}
          <View style={styles.fieldWrapper}>
            <Text style={styles.fieldLabel}>Email</Text>
            <View
              style={[
                styles.inputContainer,
                focusedField === 'email' && styles.inputFocused,
              ]}
            >
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
                returnKeyType="next"
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.fieldWrapper}>
            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>Password</Text>
              <TouchableOpacity>
                <Text style={styles.forgotLink}>Forgot?</Text>
              </TouchableOpacity>
            </View>
            <View
              style={[
                styles.inputContainer,
                focusedField === 'password' && styles.inputFocused,
              ]}
            >
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="••••••••"
                placeholderTextColor={Colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
              >
                <AppIcon name={showPassword ? 'eye-off' : 'eye'} size={18} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Sign In button */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleSignIn}
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
                <Text style={styles.primaryButtonText}>Sign In</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Divider */}
        <Animated.View
          entering={FadeInDown.delay(300).duration(600)}
          style={styles.divider}
        >
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or continue with</Text>
          <View style={styles.dividerLine} />
        </Animated.View>

        {/* Google */}
        <Animated.View entering={FadeInDown.delay(350).duration(600)}>
          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleSignIn}
            disabled={googleLoading}
            activeOpacity={0.85}
          >
            {googleLoading ? (
              <ActivityIndicator color={Colors.textPrimary} />
            ) : (
              <>
                <View style={styles.googleIcon}>
                  <Text style={styles.googleG}>G</Text>
                </View>
                <Text style={styles.googleButtonText}>Google</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Sign Up link */}
        <Animated.View
          entering={FadeInUp.delay(400).duration(600)}
          style={styles.signUpRow}
        >
          <Text style={styles.signUpPrompt}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
            <Text style={styles.signUpLink}>Create one</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 32,
  },
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
  backArrow: {
    color: Colors.textPrimary,
    fontSize: 18,
  },
  titleSection: {
    marginBottom: 36,
    gap: 8,
  },
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: 40,
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: Colors.textSecondary,
  },
  formSection: {
    gap: 18,
    marginBottom: 24,
  },
  fieldWrapper: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgotLink: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    color: Colors.primary,
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
  inputFocused: {
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  eyeButton: {
    padding: 4,
  },
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
  primaryGradient: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    color: '#0A0A0F',
    letterSpacing: 0.3,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 50,
    height: 54,
    gap: 10,
    marginBottom: 32,
  },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleG: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: '#4285F4',
  },
  googleButtonText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  signUpPrompt: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  signUpLink: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: Colors.primary,
  },
});
