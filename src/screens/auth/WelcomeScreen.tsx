import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  interpolate,
  FadeIn,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Colors, FontFamily } from '../../theme';
import { signInWithGoogle } from '../../lib/auth';
import type { WelcomeScreenProps } from '../../navigation/types';

const { width, height } = Dimensions.get('window');
const NUM_PARTICLES = 18;

// Deterministic particle positions so they don't change on re-render
const PARTICLES = Array.from({ length: NUM_PARTICLES }, (_, i) => ({
  id: i,
  x: ((i * 73 + 17) % 100) / 100,   // 0-1 as fraction of width
  y: ((i * 47 + 31) % 100) / 100,   // 0-1 as fraction of height
  size: 2 + (i % 3),
  delay: (i * 200) % 2000,
  color: i % 3 === 0 ? Colors.primary : i % 3 === 1 ? Colors.accent : Colors.textPrimary,
  opacity: 0.15 + (i % 4) * 0.1,
}));

function Particle({ x, y, size, delay, color, opacity }: (typeof PARTICLES)[0]) {
  const anim = useSharedValue(0);

  useEffect(() => {
    anim.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2400 + delay * 0.3, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 2400 + delay * 0.3, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(anim.value, [0, 1], [opacity * 0.3, opacity]),
    transform: [
      { translateY: interpolate(anim.value, [0, 1], [0, -12 - size * 2]) },
      { scale: interpolate(anim.value, [0, 0.5, 1], [0.8, 1.2, 0.8]) },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: x * width,
          top: y * height,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

// Glow orb behind logo
function GlowOrb() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, []);

  const greenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.08, 0.18]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.9, 1.1]) }],
  }));

  const orangeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.06, 0.14]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1.1, 0.9]) }],
  }));

  return (
    <>
      <Animated.View style={[styles.glowOrb, styles.glowGreen, greenStyle]} />
      <Animated.View style={[styles.glowOrb, styles.glowOrange, orangeStyle]} />
    </>
  );
}

export default function WelcomeScreen({ navigation }: WelcomeScreenProps) {
  const [googleLoading, setGoogleLoading] = React.useState(false);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      // Auth state listener in App.tsx handles the rest
    } catch (err: any) {
      if (!err.message?.includes('cancelled')) {
        Alert.alert('Google Sign In Failed', err.message);
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Background gradient */}
      <LinearGradient
        colors={['#0A0A0F', '#0D0D18', '#0A0A0F']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
      />

      {/* Ambient glow orbs */}
      <GlowOrb />

      {/* Floating particles */}
      {PARTICLES.map((p) => (
        <Particle key={p.id} {...p} />
      ))}

      {/* Content */}
      <View style={styles.content}>
        {/* Logo / Brand */}
        <Animated.View entering={FadeInDown.delay(200).duration(800)} style={styles.logoSection}>
          <View style={styles.logoMark}>
            <LinearGradient
              colors={[Colors.primary, '#00C96A']}
              style={styles.logoGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.logoIcon}>⚡</Text>
            </LinearGradient>
          </View>
          <Text style={styles.appName}>MACROLEAGUE</Text>
          <View style={styles.taglineRow}>
            <Text style={styles.taglineWord}>EAT</Text>
            <View style={styles.taglineDot} />
            <Text style={styles.taglineWord}>COMPETE</Text>
            <View style={styles.taglineDot} />
            <Text style={[styles.taglineWord, { color: Colors.primary }]}>WIN</Text>
          </View>
        </Animated.View>

        {/* Hero copy */}
        <Animated.View entering={FadeIn.delay(500).duration(800)} style={styles.heroSection}>
          <Text style={styles.heroHeadline}>Track macros.{'\n'}Beat your team.</Text>
          <Text style={styles.heroSub}>
            The only nutrition app where consistency{'\n'}earns real rewards.
          </Text>
        </Animated.View>

        {/* CTAs */}
        <Animated.View entering={FadeInUp.delay(700).duration(800)} style={styles.ctaSection}>
          {/* Google Sign In */}
          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleSignIn}
            activeOpacity={0.85}
            disabled={googleLoading}
          >
            <View style={styles.googleIcon}>
              <Text style={styles.googleG}>G</Text>
            </View>
            <Text style={styles.googleButtonText}>
              {googleLoading ? 'Signing in...' : 'Continue with Google'}
            </Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email Sign Up */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('SignUp')}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[Colors.primary, '#00C96A']}
              style={styles.primaryGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.primaryButtonText}>Create Free Account</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Sign In */}
          <TouchableOpacity
            style={styles.signInRow}
            onPress={() => navigation.navigate('SignIn')}
            activeOpacity={0.7}
          >
            <Text style={styles.signInPrompt}>Already have an account? </Text>
            <Text style={styles.signInLink}>Sign in</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Bottom badge */}
      <Animated.View entering={FadeIn.delay(1000).duration(600)} style={styles.badgeRow}>
        <Text style={styles.badgeText}>🏫 Rutgers University MVP</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  particle: {
    position: 'absolute',
  },
  glowOrb: {
    position: 'absolute',
    borderRadius: 999,
  },
  glowGreen: {
    width: 320,
    height: 320,
    backgroundColor: Colors.primary,
    top: height * 0.1,
    left: width * 0.5 - 160,
  },
  glowOrange: {
    width: 240,
    height: 240,
    backgroundColor: Colors.accent,
    top: height * 0.55,
    left: width * 0.1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-around',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
  },
  logoSection: {
    alignItems: 'center',
    gap: 12,
  },
  logoMark: {
    marginBottom: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  logoGradient: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIcon: {
    fontSize: 36,
  },
  appName: {
    fontFamily: FontFamily.displayBold,
    fontSize: 42,
    color: Colors.textPrimary,
    letterSpacing: 4,
    textAlign: 'center',
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  taglineWord: {
    fontFamily: FontFamily.displaySemiBold,
    fontSize: 15,
    color: Colors.textSecondary,
    letterSpacing: 3,
  },
  taglineDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.accent,
  },
  heroSection: {
    alignItems: 'center',
    gap: 12,
  },
  heroHeadline: {
    fontFamily: FontFamily.displayBold,
    fontSize: 44,
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 48,
    letterSpacing: 1,
  },
  heroSub: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  ctaSection: {
    gap: 12,
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 2,
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
  primaryButton: {
    borderRadius: 50,
    overflow: 'hidden',
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
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  signInPrompt: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  signInLink: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: Colors.primary,
  },
  badgeRow: {
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  badgeText: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
});
