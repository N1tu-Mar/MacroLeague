import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontFamily, FontSize } from '../../theme';
import AppIcon from './AppIcon';

interface RankMovementProps {
  /** previousRank - rank: positive = climbed, negative = dropped, 0 = unchanged. */
  movement: number;
  size?: number;
}

/** Compact rank trend indicator. Green up, red down, muted dash for no change. */
export default function RankMovement({ movement, size = FontSize.meta }: RankMovementProps) {
  if (movement === 0) {
    return <Text style={[styles.flat, { fontSize: size }]}>–</Text>;
  }
  const up = movement > 0;
  const color = up ? Colors.success : Colors.error;
  return (
    <View style={styles.row}>
      <AppIcon name={up ? 'trend-up' : 'trend-down'} size={size + 2} color={color} />
      <Text style={[styles.value, { color, fontSize: size }]}>{Math.abs(movement)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  value: { fontFamily: FontFamily.bodySemiBold },
  flat: { color: Colors.textTertiary, fontFamily: FontFamily.bodySemiBold },
});
