import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontFamily, FontSize, Spacing, alpha } from '../theme';
import Card from './ui/Card';
import Avatar from './ui/Avatar';

interface RivalCardProps {
  myName: string;
  myPoints: number;
  rivalName: string;
  rivalPoints: number;
  /** Points behind the rival (positive). */
  gap: number;
  suggestedAction?: string;
  onPress?: () => void;
}

/**
 * "You vs <rival>" race card. A two-sided bar visualizes how close the chase is,
 * and the copy tells the user exactly what to do to pass them.
 */
export default function RivalCard({
  myName,
  myPoints,
  rivalName,
  rivalPoints,
  gap,
  suggestedAction,
  onPress,
}: RivalCardProps) {
  const total = myPoints + rivalPoints || 1;
  const myShare = Math.max(0.08, Math.min(0.92, myPoints / total));

  return (
    <Card onPress={onPress} accent={alpha(Colors.primary, 0.3)}>
      <View style={styles.header}>
        <Text style={styles.title}>You're chasing {rivalName}</Text>
        <Text style={styles.gap}>{gap} pts</Text>
      </View>

      <View style={styles.racers}>
        <View style={styles.racer}>
          <Avatar name={myName} size={34} ring={Colors.primary} />
          <Text style={styles.racerName} numberOfLines={1}>You</Text>
        </View>
        <View style={styles.racer}>
          <Avatar name={rivalName} size={34} ring={Colors.accent} />
          <Text style={styles.racerName} numberOfLines={1}>{rivalName}</Text>
        </View>
      </View>

      {/* Two-sided race bar */}
      <View style={styles.raceTrack}>
        <View style={[styles.raceFillMe, { flex: myShare }]} />
        <View style={[styles.raceFillRival, { flex: 1 - myShare }]} />
      </View>
      <View style={styles.scoreRow}>
        <Text style={styles.myScore}>{myPoints.toLocaleString()}</Text>
        <Text style={styles.rivalScore}>{rivalPoints.toLocaleString()}</Text>
      </View>

      {suggestedAction ? <Text style={styles.action}>💡 {suggestedAction}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  title: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.body, color: Colors.textPrimary },
  gap: { fontFamily: FontFamily.displayBold, fontSize: FontSize.subhead, color: Colors.accent },
  racers: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  racer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, maxWidth: '48%' },
  racerName: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.label, color: Colors.textSecondary },
  raceTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: Colors.track,
    gap: 2,
  },
  raceFillMe: { backgroundColor: Colors.primary, borderRadius: 5 },
  raceFillRival: { backgroundColor: alpha(Colors.accent, 0.7), borderRadius: 5 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.xs },
  myScore: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.meta, color: Colors.primary },
  rivalScore: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.meta, color: Colors.accent },
  action: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.label,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
