import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, FontFamily } from '../../theme';
import { useUserStore } from '../../store/userStore';
import { useChallengeStore } from '../../store/challengeStore';
import { useDailyTotals } from '../../hooks/useDailyTotals';
import MacroRing from '../../components/MacroRing';
import StreakFlame from '../../components/StreakFlame';
import ChallengeCard from '../../components/ChallengeCard';
import FoodLogItem from '../../components/FoodLogItem';
import { MOCK_ACTIVITY_FEED } from '../../data/mockData';

export default function HomeScreen({ navigation }: any) {
  const user = useUserStore((s) => s.user);
  const challenges = useChallengeStore((s) => s.challenges);

  const today = useMemo(() => new Date(), []);
  const daily = useDailyTotals(today);
  const totals = daily.totals;
  const goals = daily.goals;

  // Re-pull today's meals/totals whenever Home regains focus, so a meal logged
  // on the Log tab is reflected here without needing an app restart.
  useFocusEffect(
    useCallback(() => {
      daily.refresh();
    }, [daily.refresh])
  );

  const activeChallenges = challenges.filter((c) => c.status === 'active');
  const greeting = getGreeting();
  const proteinGoal = goals?.proteinG ?? 0;
  const proteinPct = proteinGoal > 0 ? Math.round((totals.proteinG / proteinGoal) * 100) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>
            {greeting}, {user?.name ?? 'Athlete'} 🔥
          </Text>
          <View style={styles.streakBadge}>
            <StreakFlame count={user?.streakCount ?? 0} size="small" />
            <Text style={styles.streakText}>{user?.streakCount}-day streak</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.levelBadge}>
            <Text style={styles.levelText}>Lv {user?.level ?? 1}</Text>
          </View>
          <TouchableOpacity
            style={styles.pointsBadge}
            onPress={() => navigation.navigate('Rewards')}
          >
            <Text style={styles.pointsText}>⭐ {user?.points?.toLocaleString() ?? 0}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Macro Rings */}
      <View style={styles.ringSection}>
        <Text style={styles.sectionTitle}>TODAY'S MACROS</Text>
        <View style={styles.ringsRow}>
          <MacroRing label="Calories" current={Math.round(totals.calories)} goal={goals?.calories ?? 0} />
          <MacroRing label="Protein" current={Math.round(totals.proteinG)} goal={goals?.proteinG ?? 0} />
          <MacroRing label="Carbs" current={Math.round(totals.carbsG)} goal={goals?.carbsG ?? 0} />
          <MacroRing label="Fats" current={Math.round(totals.fatG)} goal={goals?.unsaturatedFatG ?? 0} />
        </View>
      </View>

      {/* Log a Meal CTA */}
      <TouchableOpacity
        style={styles.logButton}
        onPress={() => navigation.navigate('Log')}
        activeOpacity={0.85}
      >
        <Text style={styles.logButtonText}>+ LOG A MEAL</Text>
      </TouchableOpacity>

      {/* Progress Toast */}
      {totals.proteinG > 0 && proteinGoal > 0 && (
        <View style={styles.progressToast}>
          <Text style={styles.progressText}>
            {proteinPct >= 100
              ? `You hit your protein goal today! 💪`
              : `You're ${proteinPct}% to your protein goal today.`}
          </Text>
        </View>
      )}

      {/* Active Challenge */}
      {activeChallenges.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACTIVE CHALLENGE</Text>
          <ChallengeCard
            challenge={activeChallenges[0]}
            onPress={() => navigation.navigate('Challenges')}
          />
        </View>
      )}

      {/* Today's Meals */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>TODAY'S MEALS</Text>
        {daily.error ? (
          <Text style={styles.mealsNotice}>{daily.error.message}</Text>
        ) : daily.isLoading ? (
          <Text style={styles.mealsNotice}>Loading your meals...</Text>
        ) : daily.meals.length === 0 ? (
          <Text style={styles.mealsNotice}>No meals logged yet today.</Text>
        ) : (
          daily.meals.map((meal) => <FoodLogItem key={meal.id} meal={meal} />)
        )}
      </View>

      {/* Activity Feed */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>TEAM ACTIVITY</Text>
        {MOCK_ACTIVITY_FEED.slice(0, 4).map((item) => (
          <View key={item.id} style={styles.feedItem}>
            <View style={styles.feedAvatar}>
              <Text style={styles.feedAvatarText}>{item.userName[0]}</Text>
            </View>
            <View style={styles.feedInfo}>
              <Text style={styles.feedName}>{item.userName}</Text>
              <Text style={styles.feedMeta}>{item.metadata}</Text>
            </View>
            <Text style={styles.feedTime}>
              {getRelativeTime(item.createdAt)}
            </Text>
          </View>
        ))}
      </View>

      {/* Rewards Banner */}
      <TouchableOpacity
        style={styles.rewardsBanner}
        onPress={() => navigation.navigate('Rewards')}
        activeOpacity={0.85}
      >
        <Text style={styles.rewardsBannerIcon}>🎁</Text>
        <View style={styles.rewardsBannerInfo}>
          <Text style={styles.rewardsBannerTitle}>Rewards & Discounts</Text>
          <Text style={styles.rewardsBannerSub}>
            {user?.points?.toLocaleString() ?? 0} points — Tap to redeem
          </Text>
        </View>
        <Text style={styles.rewardsBannerArrow}>›</Text>
      </TouchableOpacity>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  headerRight: { alignItems: 'flex-end', gap: 6 },
  greeting: { fontFamily: FontFamily.displayBold, fontSize: 26, color: Colors.textPrimary },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  streakText: { fontFamily: FontFamily.bodyMedium, fontSize: 13, color: Colors.accent },
  levelBadge: {
    backgroundColor: Colors.primary + '18',
    borderWidth: 1,
    borderColor: Colors.primary + '44',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  levelText: { fontFamily: FontFamily.displayBold, fontSize: 14, color: Colors.primary },
  pointsBadge: {
    backgroundColor: Colors.gold + '18',
    borderWidth: 1,
    borderColor: Colors.gold + '44',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pointsText: { fontFamily: FontFamily.displayBold, fontSize: 12, color: Colors.gold },
  ringSection: { marginBottom: 20 },
  sectionTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  ringsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  logButton: {
    backgroundColor: Colors.primary,
    borderRadius: 50,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  logButtonText: { fontFamily: FontFamily.displayBold, fontSize: 16, color: Colors.background },
  progressToast: {
    backgroundColor: Colors.primary + '12',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary + '22',
    padding: 12,
    marginBottom: 20,
  },
  progressText: { fontFamily: FontFamily.bodyMedium, fontSize: 13, color: Colors.primary, textAlign: 'center' },
  section: { marginBottom: 20 },
  mealsNotice: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.textSecondary,
    paddingVertical: 8,
  },
  feedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  feedAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  feedAvatarText: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: Colors.textPrimary },
  feedInfo: { flex: 1 },
  feedName: { fontFamily: FontFamily.bodyMedium, fontSize: 13, color: Colors.textPrimary },
  feedMeta: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  feedTime: { fontFamily: FontFamily.body, fontSize: 11, color: Colors.textSecondary },
  rewardsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gold + '0D',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.gold + '22',
    padding: 16,
    marginBottom: 8,
  },
  rewardsBannerIcon: { fontSize: 28, marginRight: 12 },
  rewardsBannerInfo: { flex: 1 },
  rewardsBannerTitle: { fontFamily: FontFamily.displayBold, fontSize: 15, color: Colors.gold },
  rewardsBannerSub: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  rewardsBannerArrow: { fontFamily: FontFamily.displayBold, fontSize: 24, color: Colors.gold },
});
