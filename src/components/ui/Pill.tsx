import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors, FontFamily, FontSize, Radius, Spacing, alpha } from '../../theme';

interface PillProps {
  label: string;
  /** Semantic color; used as text + tinted background (or solid fill). */
  color?: string;
  /** Solid filled pill (used for the strongest emphasis like "Promotion zone"). */
  filled?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
}

/** Small rounded status chip. Tinted by default, solid when `filled`. */
export default function Pill({ label, color = Colors.textSecondary, filled, icon, style }: PillProps) {
  const bg = filled ? color : alpha(color, 0.14);
  const fg = filled ? Colors.textOnBrand : color;
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
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.meta,
    letterSpacing: 0.3,
  },
});
