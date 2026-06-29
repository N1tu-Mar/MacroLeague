import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, FontFamily, FontSize, Spacing, Radius, Shadow, alpha } from '../../theme';
import { useUserStore } from '../../store/userStore';
import { useDailyTotals } from '../../hooks/useDailyTotals';
import Card from '../../components/ui/Card';
import NutritionScoreCard from '../../components/NutritionScoreCard';
import MacroProgressBar from '../../components/MacroProgressBar';
import StreakCard from '../../components/StreakCard';
import RivalCard from '../../components/RivalCard';
import ActivityFeedItem from '../../components/ActivityFeedItem';
import AppIcon from '../../components/ui/AppIcon';
import RotatingTrophy from '../../components/animations/RotatingTrophy';
import FoodLogItem from '../../components/FoodLogItem';
import { getLeaderboard, LeaderboardUser, publicLeaderboardName } from '../../services/leaderboardService';
import { getProfileIdentity } from '../../services/profileService';
import {
  getRecentDailyActivity,
  getRecentActivityFeed,
  ActivityFeedEntry,
} from '../../services/activityService';
import { computeNutritionScore } from '../../lib/nutritionScore';

const ORDINAL = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HomeScreen({ navigation }: any) {
  const user = useUserStore((s) => s.user);
  const refreshStats = useUserStore((s) => s.refreshStats);

  const today = useMemo(() => new Date(), []);
  const daily = useDailyTotals(today);
  const totals = daily.totals;
  const goals = daily.goals;

  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [feed, setFeed] = useState<ActivityFeedEntry[]>([]);
  const [yesterdayScore, setYesterdayScore] = useState<number | null>(null);
  // The user's preferred name from the profiles table (display_name → username).
  const [profileName, setProfileName] = useState<string | null>(null);

  // Load the real saved name from the database so the greeting shows e.g.
  // "Good evening, Nityanth" instead of an auth-derived "user_<id>" placeholder.
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    getProfileIdentity(user.id)
      .then((identity) => {
        if (active) setProfileName(identity.displayName ?? identity.username);
      })
      .catch(() => {
        // Keep the fallback below if the profile can't be read.
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  // On focus: refresh real meals/totals + backend stats, and pull the real
  // leaderboard (for rank/rival), recent activity feed, and yesterday's macros
  // (for the nutrition-score delta). All Supabase-backed — no mock data.
  useFocusEffect(
    useCallback(() => {
      let active = true;
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
          const yKey = dateKey(new Date(Date.now() - 86400000));
          const yRow = activity.find((a) => a.date === yKey);
          setYesterdayScore(
            yRow
              ? computeNutritionScore(
                  { calories: yRow.calories, proteinG: yRow.proteinG, carbsG: yRow.carbsG },
                  goals
                    ? { calories: goals.calories ?? 0, proteinG: goals.proteinG ?? 0, carbsG: goals.carbsG ?? 0 }
                    : null,
                ).score
              : null,
          );
        } catch {
          // Leave the last good data; the real macro sections below still render.
        }
      })();
      return () => {
        active = false;
      };
    }, [daily.refresh, refreshStats, goals]),
  );

  const greeting = getGreeting();
  // Prefer the real saved profile name; never show the "user_<id>" placeholder.
  const resolvedName =
    profileName && !profileName.startsWith('user_')
      ? profileName
      : user?.name && !user.name.startsWith('user_')
      ? user.name
      : 'Athlete';
  const firstName = resolvedName.split(' ')[0];

  // Real rank + rival from the leaderboard.
  const myIndex = leaderboard.findIndex((r) => r.userId === user?.id);
  const me = myIndex >= 0 ? leaderboard[myIndex] : null;
  const rival = myIndex > 0 ? leaderboard[myIndex - 1] : null;
  const rivalGap = me && rival ? rival.score - me.score : 0;

  // Real nutrition score from today's adherence + delta vs yesterday.
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
  const unsatPartial = totals.unsaturatedFat.missingCount > 0;

  const nextActionText = proteinMet
    ? 'Protein goal locked — log dinner to pad your score'
    : proteinGoal > 0
    ? `Log dinner to close ${proteinLeft}g of protein`
    : 'Log a meal to start your day';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting},</Text>
          <Text style={styles.name}>{firstName}</Text>
        </View>
        <TouchableOpacity
          style={styles.pointsBadge}
          onPress={() => navigation.navigate('Rewards')}
          activeOpacity={0.85}
        >
          <View style={styles.pointsValueRow}>
            <AppIcon name="star" size={15} color={Colors.gold} />
            <Text style={styles.pointsValue}>{user?.points?.toLocaleString() ?? 0}</Text>
          </View>
          <Text style={styles.pointsLabel}>Lv {user?.level ?? 1}</Text>
        </TouchableOpacity>
      </View>

      {/* HERO: real leaderboard standing */}
      <Card variant="hero" onPress={() => navigation.navigate('Leaderboard')} accent={alpha(Colors.primary, 0.35)}>
        <View style={styles.heroTop}>
          <View style={styles.heroTitleRow}>
            <RotatingTrophy size={19} />
            <Text style={styles.heroTitle}>Global Leaderboard</Text>
          </View>
          <Text style={styles.heroWindow}>last 2 weeks</Text>
        </View>
        {me ? (
          <>
            <View style={styles.heroRankRow}>
              <View>
                <Text style={styles.heroLabel}>YOUR RANK</Text>
                <Text style={styles.heroRank}>{ORDINAL(me.rank)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.heroPoints}>{me.score.toLocaleString()}</Text>
                <Text style={styles.heroPointsLabel}>pts</Text>
              </View>
            </View>
            <View style={styles.heroChase}>
              {rival && rivalGap > 0 ? (
                <Text style={styles.heroChaseText}>
                  <Text style={styles.heroChaseStrong}>{rivalGap} pts</Text> behind{' '}
                  {publicLeaderboardName(rival)}
                </Text>
              ) : (
                <>
                  <Text style={styles.heroChaseText}>You lead the league</Text>
                  <AppIcon name="crown" size={15} color={Colors.gold} />
                </>
              )}
            </View>
          </>
        ) : (
          <View style={styles.heroEmpty}>
            <Text style={styles.heroEmptyText}>You're not ranked yet</Text>
            <Text style={styles.heroEmptySub}>Log meals to earn points and climb the board.</Text>
          </View>
        )}
      </Card>

      {/* Nutrition score — real adherence */}
      <Card variant="elevated" style={styles.scoreCard}>
        <NutritionScoreCard score={nutrition.score} delta={scoreDelta} status={nutrition.status} />
      </Card>

      {/* Daily progress — REAL data */}
      <Text style={styles.sectionTitle}>TODAY'S PROGRESS</Text>
      <Card style={styles.progressCard}>
        {daily.isLoading ? (
          <Text style={styles.notice}>Loading your progress…</Text>
        ) : daily.error ? (
          <Text style={styles.notice}>Couldn't load today's progress. Pull to refresh.</Text>
        ) : (
          <>
            <MacroProgressBar label="Calories" current={totals.calories} target={goals?.calories ?? 0} unit="" color={Colors.accent} />
            <MacroProgressBar label="Protein" current={totals.proteinG} target={goals?.proteinG ?? 0} />
            <MacroProgressBar label="Carbs" current={totals.carbsG} target={goals?.carbsG ?? 0} />
            <MacroProgressBar
              label="Unsat. Fat"
              current={totals.unsaturatedFat.grams}
              target={goals?.unsaturatedFatG ?? 0}
              note={unsatPartial ? 'Partial — some meals lack a breakdown' : undefined}
            />
          </>
        )}
      </Card>

      {/* Next action CTA */}
      <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('Log')} activeOpacity={0.9}>
        <View style={{ flex: 1 }}>
          <Text style={styles.ctaLabel}>{nextActionText}</Text>
          <Text style={styles.ctaSub}>Earn points and climb the board</Text>
        </View>
        <AppIcon name="plus" size={28} color={Colors.textPrimary} strokeWidth={2.5} />
      </TouchableOpacity>

      {/* Streak */}
      <StreakCard streakCount={user?.streakCount ?? 0} nextMilestone={14} />

      {/* Rival race — real */}
      {me && rival && (
        <View style={styles.section}>
          <RivalCard
            myName={firstName}
            myPoints={me.score}
            rivalName={publicLeaderboardName(rival)}
            rivalPoints={rival.score}
            gap={rivalGap}
            suggestedAction={`Hit your protein goal today to pass ${publicLeaderboardName(rival)}`}
            onPress={() => navigation.navigate('Leaderboard')}
          />
        </View>
      )}

      {/* Today's meals — REAL data */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>TODAY'S MEALS</Text>
          {daily.meals.length > 0 && <Text style={styles.sectionCount}>{daily.meals.length} logged</Text>}
        </View>
        {daily.error ? (
          <Text style={styles.notice}>Couldn't load today's meals.</Text>
        ) : daily.isLoading ? (
          <Text style={styles.notice}>Loading your meals…</Text>
        ) : daily.meals.length === 0 ? (
          <Card style={styles.emptyMeals}>
            <AppIcon name="meal" size={32} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>No meals logged yet today</Text>
            <Text style={styles.emptySub}>Log one to earn points and climb the league.</Text>
          </Card>
        ) : (
          daily.meals.map((meal) => <FoodLogItem key={meal.id} meal={meal} />)
        )}
      </View>

      {/* Recent activity — the user's REAL gamification events */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>RECENT ACTIVITY</Text>
        <Card padded={false} style={styles.feedCard}>
          {feed.length === 0 ? (
            <Text style={[styles.notice, { padding: Spacing.base }]}>
              No recent activity yet. Log a meal to get started.
            </Text>
          ) : (
            feed.map((item, i) => (
              <View key={item.id} style={i > 0 ? styles.feedDivider : undefined}>
                <ActivityFeedItem name={firstName} icon={item.icon} text={item.text} minutesAgo={item.minutesAgo} />
              </View>
            ))
          )}
        </Card>
      </View>

      <View style={{ height: Spacing.xxl }} />
    </ScrollView>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingTop: 60, paddingBottom: Spacing.xxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  greeting: { fontFamily: FontFamily.body, fontSize: FontSize.body, color: Colors.textSecondary },
  name: { fontFamily: FontFamily.displayBold, fontSize: FontSize.title, color: Colors.textPrimary },
  pointsBadge: {
    alignItems: 'center',
    backgroundColor: alpha(Colors.gold, 0.1),
    borderWidth: 1,
    borderColor: alpha(Colors.gold, 0.3),
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  pointsValue: { fontFamily: FontFamily.displayBold, fontSize: FontSize.body, color: Colors.gold },
  pointsValueRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pointsLabel: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.micro, color: Colors.textSecondary, marginTop: 1 },

  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.base },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  heroTitle: { fontFamily: FontFamily.displayBold, fontSize: FontSize.subhead, color: Colors.gold },
  heroWindow: { fontFamily: FontFamily.body, fontSize: FontSize.meta, color: Colors.textSecondary },
  heroRankRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: Spacing.md },
  heroLabel: { fontFamily: FontFamily.displayBold, fontSize: FontSize.meta, color: Colors.textSecondary, letterSpacing: 1.5 },
  heroRank: { fontFamily: FontFamily.displayBold, fontSize: FontSize.hero, color: Colors.textPrimary, lineHeight: FontSize.hero + 2 },
  heroPoints: { fontFamily: FontFamily.displayBold, fontSize: FontSize.heading, color: Colors.primary },
  heroPointsLabel: { fontFamily: FontFamily.body, fontSize: FontSize.meta, color: Colors.textSecondary },
  heroChase: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md },
  heroChaseText: { fontFamily: FontFamily.body, fontSize: FontSize.label, color: Colors.textSecondary },
  heroChaseStrong: { fontFamily: FontFamily.displayBold, color: Colors.textPrimary },
  heroEmpty: { paddingVertical: Spacing.sm },
  heroEmptyText: { fontFamily: FontFamily.displayBold, fontSize: FontSize.subhead, color: Colors.textPrimary },
  heroEmptySub: { fontFamily: FontFamily.body, fontSize: FontSize.label, color: Colors.textSecondary, marginTop: 2 },

  scoreCard: { marginTop: Spacing.base, paddingVertical: Spacing.lg },
  progressCard: { marginBottom: Spacing.base },

  sectionTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.label,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionCount: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.meta, color: Colors.textTertiary, marginTop: Spacing.lg, marginBottom: Spacing.md },
  section: { marginTop: Spacing.xs },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.base,
    marginBottom: Spacing.base,
    ...Shadow.floating,
  },
  ctaLabel: { fontFamily: FontFamily.displayBold, fontSize: FontSize.subhead, color: Colors.textPrimary },
  ctaSub: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.meta, color: alpha(Colors.textPrimary, 0.75), marginTop: 2 },

  feedCard: { paddingHorizontal: Spacing.base },
  feedDivider: { borderTopWidth: 1, borderTopColor: Colors.border },

  emptyMeals: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl },
  emptyText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.body, color: Colors.textPrimary },
  emptySub: { fontFamily: FontFamily.body, fontSize: FontSize.label, color: Colors.textSecondary, marginTop: 4, textAlign: 'center' },

  notice: { fontFamily: FontFamily.body, fontSize: FontSize.label, color: Colors.textSecondary, paddingVertical: Spacing.sm },
});
