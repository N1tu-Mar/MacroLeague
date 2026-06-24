import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, FontFamily, FontSize, Spacing, Radius, alpha } from '../theme';
import Avatar from './ui/Avatar';
import RankMovement from './ui/RankMovement';

// Visual zone tint for a leaderboard row. Local type (no longer sourced from mock
// league data); 'safe' is the neutral default used by the real global leaderboard.
export type LeagueZone = 'promotion' | 'relegation' | 'safe';

export interface LeaderboardRowProps {
  rank: number;
  name: string;
  points: number;
  streak: number;
  movement: number;
  zone?: LeagueZone;
  isCurrentUser?: boolean;
  isRival?: boolean;
  badge?: string;
  avatarUrl?: string | null;
  onPress?: () => void;
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

/**
 * One league-table row. Conveys a lot at a glance: rank/medal, movement vs last
 * week, who it is + a status badge, points, and streak. The left edge is tinted
 * by promotion/relegation zone; the current user gets a brand highlight and the
 * rival a subtle accent ring so the chase reads instantly.
 */
export default function LeaderboardRow({
  rank,
  name,
  points,
  streak,
  movement,
  zone = 'safe',
  isCurrentUser,
  isRival,
  badge,
  avatarUrl,
  onPress,
}: LeaderboardRowProps) {
  const zoneColor =
    zone === 'promotion' ? Colors.promotion : zone === 'relegation' ? Colors.relegation : Colors.border;

  const ring = isCurrentUser
    ? Colors.primary
    : rank === 1
    ? Colors.gold
    : isRival
    ? Colors.accent
    : undefined;

  const Wrapper: any = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      {...(onPress ? { onPress, activeOpacity: 0.85 } : {})}
      style={[
        styles.row,
        { borderLeftColor: zoneColor, borderLeftWidth: zone === 'safe' ? 1 : 3 },
        isCurrentUser && styles.currentUser,
        isRival && !isCurrentUser && styles.rival,
      ]}
    >
      <View style={styles.rankCol}>
        {MEDAL[rank] ? (
          <Text style={styles.medal}>{MEDAL[rank]}</Text>
        ) : (
          <Text style={[styles.rankNum, isCurrentUser && { color: Colors.primary }]}>{rank}</Text>
        )}
        <RankMovement movement={movement} />
      </View>

      <Avatar name={name} uri={avatarUrl} size={38} ring={ring} />

      <View style={styles.info}>
        <Text style={[styles.name, isCurrentUser && { color: Colors.primary }]} numberOfLines={1}>
          {name}{isCurrentUser ? ' (You)' : ''}
        </Text>
        {badge ? (
          <Text style={styles.badge} numberOfLines={1}>{badge}</Text>
        ) : (
          <View style={styles.streakRow}>
            <Text style={styles.streakIcon}>🔥</Text>
            <Text style={styles.streakText}>{streak}-day</Text>
          </View>
        )}
      </View>

      <View style={styles.pointsCol}>
        <Text style={[styles.points, isCurrentUser && { color: Colors.primary }]}>
          {points.toLocaleString()}
        </Text>
        <Text style={styles.pointsLabel}>pts</Text>
      </View>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  currentUser: {
    backgroundColor: alpha(Colors.primary, 0.1),
    borderColor: alpha(Colors.primary, 0.4),
  },
  rival: {
    borderColor: alpha(Colors.accent, 0.35),
  },
  rankCol: { width: 30, alignItems: 'center', gap: 2 },
  medal: { fontSize: 18 },
  rankNum: { fontFamily: FontFamily.displayBold, fontSize: FontSize.subhead, color: Colors.textSecondary },
  info: { flex: 1 },
  name: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.body, color: Colors.textPrimary },
  badge: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.meta, color: Colors.accent, marginTop: 1 },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  streakIcon: { fontSize: FontSize.micro },
  streakText: { fontFamily: FontFamily.body, fontSize: FontSize.meta, color: Colors.textSecondary },
  pointsCol: { alignItems: 'flex-end' },
  points: { fontFamily: FontFamily.displayBold, fontSize: FontSize.subhead, color: Colors.textPrimary },
  pointsLabel: { fontFamily: FontFamily.body, fontSize: FontSize.micro, color: Colors.textTertiary },
});
