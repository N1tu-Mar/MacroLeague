import React, { useState } from 'react';
import { View, Pressable, Platform } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { FontFamily, Spacing, Type, useTheme } from '../../theme';
import {
  Screen,
  Text,
  Button,
  AppIcon,
  Avatar,
  ProgressBar,
} from '../../components/ui';
import BrandMark from '../../components/BrandMark';
import LegalNotice from '../../components/LegalNotice';
import { signInWithGoogle, signInWithApple } from '../../lib/auth';
import type { WelcomeScreenProps } from '../../navigation/types';

// Sign in with Apple is required on iOS (App Store Guideline 4.8) and works on web
// via Supabase OAuth; Android stays Google-only (no native Apple sheet there).
const SHOW_APPLE = Platform.OS !== 'android';

/** The preview card that "sells" the app: score → league gap → logged-meal loop. */
function PreviewCard() {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 26, marginHorizontal: 2, position: 'relative', paddingBottom: 20 }}>
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 20,
          padding: 18,
          paddingBottom: 16,
          shadowColor: '#171A1F',
          shadowOpacity: 0.1,
          shadowRadius: 30,
          shadowOffset: { width: 0, height: 10 },
          elevation: 8,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text variant="overline" color={colors.textSecondary}>
              Nutrition Score
            </Text>
            <Text
              color={colors.success}
              style={{ fontFamily: FontFamily.semibold, fontSize: 14, marginTop: 8 }}
            >
              Strong day
            </Text>
          </View>
          <Text style={[Type.scoreHero, { fontSize: 56, lineHeight: 50, color: colors.ink }]}>
            78
          </Text>
        </View>

        <View style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="label" color={colors.ink}>Protein</Text>
            <Text variant="label" color={colors.textSecondary}>
              <Text variant="label" color={colors.ink} style={{ fontFamily: FontFamily.semibold }}>128</Text> / 170g
            </Text>
          </View>
          <ProgressBar progress={0.75} color={colors.ink} height={8} style={{ marginTop: 6 }} />
        </View>

        <View
          style={{
            marginTop: 14,
            borderTopWidth: 1,
            borderTopColor: colors.hairline,
            paddingTop: 11,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Text style={{ fontFamily: FontFamily.numBold, fontSize: 20, color: colors.scarlet }}>#4</Text>
          <Text variant="label" color={colors.ink}>18 pts behind Maya</Text>
          <Avatar name="Maya" size={22} bg="#D8E4F2" />
          <Text
            color={colors.textSecondary}
            style={{ fontFamily: FontFamily.numSemibold, fontSize: 12, marginLeft: 'auto', letterSpacing: 0.5 }}
          >
            2D 8H LEFT
          </Text>
        </View>
      </View>

      {/* Floating "meal logged" pill overlapping the card bottom */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.hairline,
            borderRadius: 99,
            paddingVertical: 8,
            paddingHorizontal: 14,
            shadowColor: '#171A1F',
            shadowOpacity: 0.12,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 6 },
            elevation: 6,
          }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: colors.successTint,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppIcon name="checkmark" size={12} color={colors.success} strokeWidth={3} />
          </View>
          <Text variant="label" color={colors.ink} style={{ fontFamily: FontFamily.semibold }}>
            Chicken rice bowl logged
          </Text>
          <Text color={colors.success} style={{ fontFamily: FontFamily.numBold, fontSize: 12.5 }}>+50 XP</Text>
          <Text color={colors.scarlet} style={{ fontFamily: FontFamily.numBold, fontSize: 12.5 }}>+10 LP</Text>
        </View>
      </View>
    </View>
  );
}

export default function WelcomeScreen({ navigation }: WelcomeScreenProps) {
  const { colors } = useTheme();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const busy = googleLoading || appleLoading;

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
    } catch {
      // cancellation isn't worth surfacing
    } finally {
      setAppleLoading(false);
    }
  }

  return (
    <Screen padded>
      <Animated.View entering={FadeIn.duration(250)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: Spacing.xxl }}>
          <BrandMark size={30} />
          <View>
            <Text color={colors.ink} style={{ fontFamily: FontFamily.bold, fontSize: 17 }}>
              MacroLeague
            </Text>
            <Text color={colors.textSecondary} style={{ fontFamily: FontFamily.medium, fontSize: 11, marginTop: 3 }}>
              Nutrition leagues for friends
            </Text>
          </View>
        </View>

        <Text style={[Type.titleLg, { color: colors.ink, marginTop: 22 }]}>
          Track your food.{'\n'}
          <Text style={[Type.titleLg, { color: colors.scarlet }]}>Climb your league.</Text>
        </Text>
        <Text variant="bodyLg" color={colors.textSecondary} style={{ marginTop: 12, maxWidth: 310 }}>
          Log meals, hit your nutrition targets, and compete with friends.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(120)}>
        <PreviewCard />
      </Animated.View>

      <View style={{ flex: 1, minHeight: 12 }} />

      <View style={{ gap: 10 }}>
        <Button label="Get started" onPress={() => navigation.navigate('SignUp')} />
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
        <Pressable
          onPress={() => navigation.navigate('SignIn')}
          style={{ paddingVertical: 10, alignItems: 'center' }}
        >
          <Text color={colors.textSecondary}>
            Already have an account?{' '}
            <Text color={colors.scarlet} style={{ fontFamily: FontFamily.semibold }}>Sign in</Text>
          </Text>
        </Pressable>
        <LegalNotice />
      </View>
    </Screen>
  );
}
