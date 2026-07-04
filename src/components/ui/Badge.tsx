import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { FontFamily, useTheme } from '../../theme';
import { ThemeColors } from '../../theme';
import Text from './Text';

export type BadgeTone =
  | 'usda'
  | 'composite'
  | 'confidence-high'
  | 'confidence-med'
  | 'xp'
  | 'lp'
  | 'success'
  | 'neutral'
  | 'scarlet';

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Small leading dot (confidence badges). */
  dot?: boolean;
  /** Use the Barlow numeral face (XP/LP badges). */
  numeral?: boolean;
  style?: StyleProp<ViewStyle>;
}

function toneColors(tone: BadgeTone, c: ThemeColors) {
  switch (tone) {
    case 'usda':
    case 'confidence-high':
      return { fg: c.successDeep, bg: c.successTint, dot: c.success };
    case 'composite':
    case 'neutral':
      return { fg: c.textSecondary, bg: c.track, dot: c.textSecondary };
    case 'confidence-med':
      return { fg: c.goldText, bg: c.goldTint, dot: c.gold };
    case 'xp':
      return { fg: c.onPrimary, bg: c.success, dot: c.onPrimary };
    case 'lp':
    case 'scarlet':
      return { fg: c.onPrimary, bg: c.scarlet, dot: c.onPrimary };
    case 'success':
      return { fg: c.successDeep, bg: c.successTint, dot: c.success };
    default:
      return { fg: c.textSecondary, bg: c.track, dot: c.textSecondary };
  }
}

/** Source / confidence / +XP / +LP badge (spec F4). */
export default function Badge({
  label,
  tone = 'neutral',
  dot = false,
  numeral = false,
  style,
}: BadgeProps) {
  const { colors } = useTheme();
  const { fg, bg, dot: dotColor } = toneColors(tone, colors);
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          alignSelf: 'flex-start',
          backgroundColor: bg,
          borderRadius: 6,
          paddingVertical: 3,
          paddingHorizontal: 8,
        },
        style,
      ]}
    >
      {dot ? (
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: dotColor,
          }}
        />
      ) : null}
      <Text
        color={fg}
        style={{
          fontFamily: numeral ? FontFamily.numBold : FontFamily.semibold,
          fontSize: 11,
          lineHeight: 14,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
