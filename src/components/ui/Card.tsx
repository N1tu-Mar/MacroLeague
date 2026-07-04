import React from 'react';
import {
  View,
  Pressable,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Radius, Shadow, Spacing, useTheme } from '../../theme';

type CardVariant = 'default' | 'elevated' | 'hero';

interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** Accent border tint (e.g. a rival/zone highlight). */
  accent?: string;
  padded?: boolean;
}

/**
 * Base surface primitive (spec: flat by default, border-only). `default` = a
 * bordered card with no shadow, `elevated` = subtle shadow, `hero` = the
 * dominant card (soft 20px shadow, 20-radius).
 */
export default function Card({
  children,
  variant = 'default',
  style,
  onPress,
  accent,
  padded = true,
}: CardProps) {
  const { colors } = useTheme();

  const base: StyleProp<ViewStyle> = [
    {
      backgroundColor: colors.card,
      borderRadius: variant === 'hero' ? Radius.hero : Radius.card,
      borderWidth: variant === 'hero' ? 0 : 1,
      borderColor: accent ?? colors.borderCard,
    },
    variant === 'elevated' && Shadow.card,
    variant === 'hero' && Shadow.hero,
    padded && { padding: Spacing.base },
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [base, pressed && { opacity: 0.9 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
}
