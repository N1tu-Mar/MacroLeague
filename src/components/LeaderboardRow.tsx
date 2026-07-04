import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { FontFamily, Spacing, useTheme } from '../theme';
import { Avatar, StreakPill, RankMovement, Text } from './ui';

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

/**
 * One standings-table row (spec s15). Reads like a real sports table: a
 * place-colored rank numeral, the person's avatar (medal ring for the podium),
 * name + a YOU/RIVAL tag, an optional streak pill, the LP total in Barlow, and a
 * movement arrow. The current user's row is tinted (brandTint) with a 3px
 * scarlet left border so "you" reads instantly. Flat by design — it lives inside
 * a Card and is divided from its neighbours by a hairline.
 */
export default function LeaderboardRow({
  rank,
  name,
  points,
  streak,
  movement,
  isCurrentUser,
  isRival,
  badge,
  avatarUrl,
  onPress,
}: LeaderboardRowProps) {
  const { colors } = useTheme();

  const rankColor =
    rank === 1
      ? colors.gold
      : rank === 2
      ? colors.medalSilver
      : rank === 3
      ? colors.medalBronze
      : isCurrentUser
      ? colors.scarlet
      : colors.textSecondary;

  const ring =
    rank === 1
      ? colors.goldActive
      : rank === 2
      ? colors.medalSilver
      : rank === 3
      ? colors.medalBronze
      : isCurrentUser
      ? colors.scarlet
      : undefined;

  const Wrapper: any = onPress ? Pressable : View;

  return (
    <Wrapper
      {...(onPress ? { onPress } : {})}
      style={({ pressed }: { pressed?: boolean }) => [
        styles.row,
        isCurrentUser && {
          backgroundColor: colors.brandTint,
          borderLeftWidth: 3,
          borderLeftColor: colors.scarlet,
          paddingLeft: Spacing.md - 3,
        },
        pressed && !isCurrentUser && { backgroundColor: colors.track },
      ]}
    >
      <Text
        color={rankColor}
        style={styles.rank}
        allowFontScaling={false}
      >
        {rank}
      </Text>

      <Avatar name={name} url={avatarUrl} size={38} ring={ring} ringWidth={2} />

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text variant="cardTitle" color={colors.ink} numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          {isCurrentUser ? (
            <View style={[styles.youTag, { backgroundColor: colors.card }]}>
              <Text style={[styles.youTagText, { color: colors.scarlet }]}>YOU</Text>
            </View>
          ) : isRival ? (
            <Text style={[styles.rivalTag, { color: colors.scarlet }]}>RIVAL</Text>
          ) : null}
        </View>
        {badge ? (
          <Text variant="labelSm" color={colors.textSecondary} numberOfLines={1} style={{ marginTop: 1 }}>
            {badge}
          </Text>
        ) : null}
      </View>

      {streak > 0 ? <StreakPill count={streak} size={14} animated={false} /> : null}

      <View style={styles.lpCol}>
        <Text color={colors.ink} style={styles.lpValue} allowFontScaling={false}>
          {points.toLocaleString()}
        </Text>
        <Text variant="labelSm" color={colors.textSecondary} style={styles.lpUnit}>
          LP
        </Text>
      </View>

      <View style={styles.moveCol}>
        <RankMovement movement={movement} />
      </View>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  rank: {
    fontFamily: FontFamily.numBold,
    fontSize: 20,
    minWidth: 22,
    textAlign: 'center',
  },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1 },
  youTag: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  youTagText: { fontFamily: FontFamily.semibold, fontSize: 10, lineHeight: 12 },
  rivalTag: { fontFamily: FontFamily.medium, fontSize: 10, lineHeight: 12 },
  lpCol: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  lpValue: { fontFamily: FontFamily.numBold, fontSize: 17 },
  lpUnit: {},
  moveCol: { minWidth: 20, alignItems: 'flex-end' },
});
