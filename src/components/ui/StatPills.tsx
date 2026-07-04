import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { FontFamily, useTheme } from '../../theme';
import PixelFlame from '../PixelFlame';
import Text from './Text';

/** Streak pill (spec F4): pixel-flame sprite + Barlow count on a warm tint. */
export function StreakPill({
  count,
  size = 16,
  animated = true,
  style,
}: {
  count: number;
  size?: number;
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: colors.streakTint,
          borderRadius: 99,
          paddingVertical: 6,
          paddingLeft: 7,
          paddingRight: 10,
        },
        style,
      ]}
    >
      <PixelFlame size={size} animated={animated} />
      <Text
        color={colors.streak}
        style={{ fontFamily: FontFamily.numBold, fontSize: 13.5 }}
      >
        {count}
      </Text>
    </View>
  );
}

/** LP pill (spec F4): Barlow value + "LP" on a neutral track. */
export function LPPill({
  value,
  style,
}: {
  value: number | string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 3,
          backgroundColor: colors.track,
          borderRadius: 99,
          paddingVertical: 6,
          paddingHorizontal: 10,
        },
        style,
      ]}
    >
      <Text
        color={colors.ink}
        style={{ fontFamily: FontFamily.numBold, fontSize: 13.5 }}
      >
        {value}
      </Text>
      <Text
        color={colors.textSecondary}
        style={{ fontFamily: FontFamily.semibold, fontSize: 10 }}
      >
        LP
      </Text>
    </View>
  );
}
