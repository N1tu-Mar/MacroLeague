import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FontFamily, Spacing, useTheme } from '../../theme';
import { useUserStore } from '../../store/userStore';
import { useDailyTotals } from '../../hooks/useDailyTotals';
import {
  Screen,
  Text,
  Card,
  Avatar,
  AppIcon,
  StreakPill,
  LPPill,
} from '../../components/ui';
import NutritionHero from '../../components/NutritionHero';
import FoodLogItem from '../../components/FoodLogItem';
import ActivityFeedItem from '../../components/ActivityFeedItem';
import { getLeaderboard, LeaderboardUser, publicLeaderboardName } from '../../services/leaderboardService';
import { getProfileIdentity } from '../../services/profileService';
import { getRecentDailyActivity, getRecentActivityFeed, ActivityFeedEntry } from '../../services/activityService';
import { computeNutritionScore } from '../../lib/nutritionScore';

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function statusWordFor(score: number): string {
  if (score >= 80) return 'Strong day';
  if (score >= 60) return 'Solid day';
  if (score >= 40) return 'Building';
  return 'Getting started';
}

export default function HomeScreen({ navigation }: any) {
  const { colors } = useTheme();
  const user = useUserStore((s) => s.user);
  const refreshStats = useUserStore((s) => s.refreshStats);

  const [today, setToday] = useState(() => new Date());
  const daily = useDailyTotals(today);
  const totals = daily.totals;
  const goals = daily.goals;

  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [feed, setFeed] = useState<ActivityFeedEntry[]>([]);
  const [yesterdayScore, setYesterdayScore] = useState<number | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    getProfileIdentity(user.id)
      .then((identity) => {
        if (active) setProfileName(identity.displayName ?? identity.username);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const currentDate = new Date();
      setToday(currentDate);
      daily.refresh();
      void refreshStats();
      (async () => {
        try {
          const [board, recent, activity] = await Promise.all([
            getLeaderboard(14),
            getRecentActivityFeed(6),
            getRecentDailyActivity(2),
          ]);
          if (!active) return;
          setLeaderboard(board);
          setFeed(recent);
          const yesterday = new Date(currentDate);
          yesterday.setDate(yesterday.getDate() - 1);
          const yKey = dateKey(yesterday);
          const yRow = activity.find((a) => a.date === yKey);
          setYesterdayScore(
            yRow
              ? computeNutritionScore(
                  { calories: yRow.calories, proteinG: yRow.proteinG, carbsG: yRow.carbsG },
                  goals ? { calories: goals.calories ?? 0, proteinG: goals.proteinG ?? 0, carbsG: goals.carbsG ?? 0 } : null,
                ).score
              : null,
          );
        } catch {
          // keep last good data
        }
      })();
      return () => {
        active = false;
      };
    }, [daily.refresh, refreshStats, goals]),
  );

  const greeting = getGreeting();
  const resolvedName =
    profileName && !profileName.startsWith('user_')
      ? profileName
      : user?.name && !user.name.startsWith('user_')
      ? user.name
      : 'Athlete';
  const firstName = resolvedName.split(' ')[0];

  const myIndex = leaderboard.findIndex((r) => r.userId === user?.id);
  const me = myIndex >= 0 ? leaderboard[myIndex] : null;
  const rival = myIndex > 0 ? leaderboard[myIndex - 1] : null;
  const below = myIndex >= 0 && myIndex < leaderboard.length - 1 ? leaderboard[myIndex + 1] : null;
  const rivalGap = me && rival ? rival.score - me.score : 0;
  const aheadGap = me && below ? me.score - below.score : 0;

  const nutrition = useMemo(
    () =>
      computeNutritionScore(
        { calories: totals.calories, proteinG: totals.proteinG, carbsG: totals.carbsG },
        goals ? { calories: goals.calories ?? 0, proteinG: goals.proteinG ?? 0, carbsG: goals.carbsG ?? 0 } : null,
      ),
    [totals.calories, totals.proteinG, totals.carbsG, goals],
  );
  const scoreDelta = yesterdayScore === null ? 0 : nutrition.score - yesterdayScore;

  const proteinGoal = goals?.proteinG ?? 0;
  const proteinLeft = Math.max(0, Math.round(proteinGoal - totals.proteinG));
  const proteinMet = proteinGoal > 0 && totals.proteinG >= proteinGoal;
  const isNewToday = daily.meals.length === 0;

  const recommendText =
    !isNewToday && proteinLeft > 0 && !proteinMet
      ? `${proteinLeft}g protein left — log another meal to stay on pace.`
      : null;

  const streak = user?.streakCount ?? 0;

  return (
    <Screen scroll bottomSpace={96}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="section" color={colors.ink} numberOfLines={1} style={{ fontSize: 21 }}>
            {greeting}, {firstName}
          </Text>
          <Text variant="labelSm" color={colors.textSecondary} style={{ marginTop: 2 }}>
            {today.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
          </Text>
        </View>
        {!isNewToday && streak > 0 ? <StreakPill count={streak} /> : null}
        {!isNewToday ? <LPPill value={(user?.points ?? 0).toLocaleString()} /> : null}
        <Pressable onPress={() => navigation.navigate('Profile')}>
          <Avatar name={firstName} url={user?.avatarUrl} size={36} ring={colors.card} />
        </Pressable>
      </View>

      {/* Nutrition hero */}
      <View style={{ marginTop: 14 }}>
        <NutritionHero
          score={isNewToday ? null : nutrition.score}
          isNew={isNewToday}
          delta={scoreDelta}
          statusWord={statusWordFor(nutrition.score)}
          calories={{ now: totals.calories, goal: goals?.calories ?? 0 }}
          protein={{ now: totals.proteinG, goal: goals?.proteinG ?? 0 }}
          carbs={{ now: totals.carbsG, goal: goals?.carbsG ?? 0 }}
          recommendText={recommendText}
          onLog={() => navigation.navigate('Log')}
        />
      </View>

      {/* League snapshot */}
      <Card padded={false} onPress={() => navigation.navigate('Leaderboard')} style={{ marginTop: 14, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 13, paddingBottom: 10 }}>
          <Text variant="overline" color={colors.textSecondary} style={{ flex: 1 }}>2-week league</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <AppIcon name="clock" size={13} color={colors.textSecondary} />
            <Text style={{ fontFamily: FontFamily.numBold, fontSize: 13, color: colors.ink, letterSpacing: 0.5 }}>
              LAST 14 DAYS
            </Text>
          </View>
        </View>
        {me ? (
          <>
            {rival ? <LeagueRow row={rival} /> : null}
            <LeagueRow row={me} you name={firstName} />
            {below ? <LeagueRow row={below} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.rowDivider }}>
              <Text variant="labelSm" color={colors.textSecondary} style={{ flex: 1 }}>
                {rival && rivalGap > 0 ? `${rivalGap} pts behind ${publicLeaderboardName(rival)}` : 'You lead the league'}
                {below && aheadGap > 0 ? ` · ${aheadGap} ahead of ${publicLeaderboardName(below)}` : ''}
              </Text>
              <AppIcon name="chevron-right" size={16} color={colors.textTertiary} />
            </View>
          </>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: 1, borderTopColor: colors.rowDivider }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.track, alignItems: 'center', justifyContent: 'center' }}>
              <AppIcon name="trophy" size={19} color={colors.textTertiary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="cardTitle" color={colors.ink}>2-week league</Text>
              <Text variant="labelSm" color={colors.textSecondary} style={{ marginTop: 1 }}>
                You'll enter the standings after your first confirmed meal.
              </Text>
            </View>
          </View>
        )}
      </Card>

      {/* Today's meals */}
      {!isNewToday ? (
        <View style={{ marginTop: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 8 }}>
            <Text variant="section" color={colors.ink}>Today's meals</Text>
            <Text variant="labelSm" color={colors.textSecondary}>
              {Math.round(totals.calories).toLocaleString()} kcal logged
            </Text>
          </View>
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {daily.meals.map((meal, i) => (
              <FoodLogItem key={meal.id} meal={meal} showDivider={i > 0} />
            ))}
            <Pressable
              onPress={() => navigation.navigate('Log')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: colors.rowDivider }}
            >
              <View style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderInput, alignItems: 'center', justifyContent: 'center' }}>
                <AppIcon name="plus" size={18} color={colors.textTertiary} />
              </View>
              <Text variant="cardTitle" color={colors.textSecondary} style={{ flex: 1 }}>Add another meal</Text>
              <AppIcon name="chevron-right" size={16} color={colors.textTertiary} />
            </Pressable>
          </Card>
        </View>
      ) : null}

      {/* Streak */}
      {streak > 0 ? (
        <Card style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <StreakPill count={streak} size={22} />
          <View style={{ flex: 1 }}>
            <Text variant="subhead" color={colors.ink}>{streak}-day streak</Text>
            <Text variant="labelSm" color={colors.textSecondary} style={{ marginTop: 1 }}>
              {streak >= 14 ? 'You’re on fire — keep it rolling.' : `${14 - streak} days to your next milestone.`}
            </Text>
          </View>
        </Card>
      ) : null}

      {/* Friend activity */}
      {feed.length > 0 ? (
        <View style={{ marginTop: 18 }}>
          <Text variant="section" color={colors.ink} style={{ paddingHorizontal: 2, marginBottom: 8 }}>Friend activity</Text>
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {feed.map((item, i) => (
              <ActivityFeedItem
                key={item.id}
                name={firstName}
                icon={item.icon}
                text={item.text}
                minutesAgo={item.minutesAgo}
                showDivider={i > 0}
              />
            ))}
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}

/** One standings row in the Today league snapshot. */
function LeagueRow({ row, you, name }: { row: LeaderboardUser; you?: boolean; name?: string }) {
  const { colors } = useTheme();
  const displayName = you ? name ?? 'You' : publicLeaderboardName(row);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: you ? 13 : 16,
        backgroundColor: you ? colors.brandTint : 'transparent',
        borderLeftWidth: you ? 3 : 0,
        borderLeftColor: colors.scarlet,
        borderTopWidth: you ? 0 : 1,
        borderTopColor: colors.rowDivider,
      }}
    >
      <Text style={{ fontFamily: FontFamily.numBold, fontSize: 15, color: you ? colors.scarlet : colors.textSecondary, width: 18, textAlign: 'center' }}>
        {row.rank}
      </Text>
      <Avatar name={displayName} url={row.avatarUrl} size={30} />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text variant="cardTitle" color={colors.ink}>{displayName}</Text>
        {you ? (
          <Text color={colors.scarlet} style={{ fontFamily: FontFamily.semibold, fontSize: 10, backgroundColor: colors.card, borderRadius: 5, paddingVertical: 2, paddingHorizontal: 6 }}>YOU</Text>
        ) : null}
      </View>
      <Text style={{ fontFamily: FontFamily.numBold, fontSize: 15, color: colors.ink }}>
        {row.score.toLocaleString()} <Text style={{ fontFamily: FontFamily.semibold, fontSize: 10, color: colors.textTertiary }}>LP</Text>
      </Text>
    </View>
  );
}
