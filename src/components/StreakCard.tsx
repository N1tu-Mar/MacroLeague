import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontFamily, FontSize, Spacing, alpha } from '../theme';
import Card from './ui/Card';
import StreakFlame from './StreakFlame';

interface StreakCardProps {
  streakCount: number;
  /** Next milestone day count (e.g. 14). Shows "x days to go". */
  nextMilestone?: number;
}

/** Compact streak card: flame + count + a "protect your streak" nudge. */
export default function StreakCard({ streakCount, nextMilestone }: StreakCardProps) {
  const toGo = nextMilestone ? Math.max(0, nextMilestone - streakCount) : 0;

  return (
    <Card style={styles.card} accent={alpha(Colors.accent, 0.3)}>
      <View style={styles.flameWrap}>
        <StreakFlame count={streakCount} size="large" />
      </View>
      <View style={styles.info}>
        <Text style={styles.title}>{streakCount}-day streak</Text>
        <Text style={styles.sub}>
          {toGo > 0
            ? `Log today to keep it alive — ${toGo} to ${nextMilestone}-day milestone`
            : 'Log today to protect your streak'}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
  flameWrap: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  title: { fontFamily: FontFamily.displayBold, fontSize: FontSize.subhead, color: Colors.textPrimary },
  sub: { fontFamily: FontFamily.body, fontSize: FontSize.label, color: Colors.textSecondary, marginTop: 2 },
});
