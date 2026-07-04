import React from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Type, useTheme } from '../../theme';
import { Screen, Text, Button, AppIcon } from '../../components/ui';
import { AppIconName } from '../../components/ui/AppIcon';
import BrandMark from '../../components/BrandMark';

interface Feature {
  icon: AppIconName;
  tint: 'success' | 'scarlet' | 'streak' | 'gold';
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  { icon: 'meal', tint: 'success', title: 'Log meals in seconds', body: 'Describe what you ate — we estimate the macros.' },
  { icon: 'bolt', tint: 'scarlet', title: 'Earn XP + League Points', body: 'Every confirmed meal is +50 XP and +10 LP.' },
  { icon: 'league', tint: 'gold', title: 'Climb your league', body: 'Compete with friends over 2-week seasons.' },
];

export default function TutorialScreen({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme();
  const tintFor = (t: Feature['tint']) => ({
    success: { fg: colors.success, bg: colors.successTint },
    scarlet: { fg: colors.scarlet, bg: colors.brandTint },
    streak: { fg: colors.streak, bg: colors.streakTint },
    gold: { fg: colors.gold, bg: colors.goldTint },
  })[t];

  return (
    <Screen padded>
      <View style={{ flex: 1, justifyContent: 'center', gap: 28 }}>
        <Animated.View entering={FadeInDown.duration(400)} style={{ gap: 14 }}>
          <BrandMark size={40} />
          <Text style={[Type.title, { color: colors.ink }]}>You're in.</Text>
          <Text variant="bodyLg" color={colors.textSecondary}>
            Here's how MacroLeague works.
          </Text>
        </Animated.View>

        <View style={{ gap: 16 }}>
          {FEATURES.map((f, i) => {
            const t = tintFor(f.tint);
            return (
              <Animated.View
                key={f.title}
                entering={FadeInDown.duration(400).delay(120 + i * 90)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: t.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AppIcon name={f.icon} size={22} color={t.fg} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="subhead" color={colors.ink}>{f.title}</Text>
                  <Text variant="label" color={colors.textSecondary} style={{ marginTop: 2 }}>{f.body}</Text>
                </View>
              </Animated.View>
            );
          })}
        </View>
      </View>

      <Button label="Start logging" onPress={onDone} />
    </Screen>
  );
}
