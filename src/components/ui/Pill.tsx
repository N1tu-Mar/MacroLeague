import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { FontFamily, FontSize, Radius, Spacing, alpha, useTheme } from '../../theme';

interface PillProps {
  label: string;
  /** Semantic color; used as text + tinted background (or solid fill). */
  color?: string;
  /** Solid filled pill for the strongest emphasis. */
  filled?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
}

/** Small rounded status chip. Tinted by default, solid when `filled`. */
export default function Pill({ label, color, filled, icon, style }: PillProps) {
  const { colors } = useTheme();
  const c = color ?? colors.textSecondary;
  const bg = filled ? c : alpha(c, 0.14);
  const fg = filled ? colors.onPrimary : c;
  return (
    <View style={[styles.pill, { backgroundColor: bg }, style]}>
      {icon ? <Text style={[styles.icon, { color: fg }]}>{icon} </Text> : null}
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  icon: { fontSize: FontSize.meta },
  label: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.meta,
    letterSpacing: 0.3,
  },
});
