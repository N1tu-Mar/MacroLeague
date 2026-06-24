import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Colors, Radius, Shadow, Spacing } from '../../theme';

type CardVariant = 'default' | 'elevated' | 'hero';

interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** Accent border tint (e.g. a zone/rival highlight). */
  accent?: string;
  padded?: boolean;
}

/**
 * Base surface primitive. `default` = normal card, `elevated` = a bit lighter +
 * stronger shadow for important content, `hero` = the dominant card on a screen.
 * Keeps radius/shadow/padding consistent so screens stop hand-rolling cards.
 */
export default function Card({
  children,
  variant = 'default',
  style,
  onPress,
  accent,
  padded = true,
}: CardProps) {
  const base: StyleProp<ViewStyle> = [
    styles.base,
    variant === 'elevated' && styles.elevated,
    variant === 'hero' && styles.hero,
    padded && styles.padded,
    accent ? { borderColor: accent } : null,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={base}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={base}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  elevated: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
  },
  hero: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xxl,
    borderColor: Colors.borderStrong,
    ...Shadow.hero,
  },
  padded: {
    padding: Spacing.base,
  },
});
