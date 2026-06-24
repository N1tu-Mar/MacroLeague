import React, { useCallback, useMemo, useState } from 'react';
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
import { signOut } from '../../lib/auth';
import StreakFlame from '../../components/StreakFlame';
import { LEVEL_TITLES, getXpForLevel } from '../../lib/leveling';
import { deriveAchievements } from '../../lib/achievements';
import { getRecentDailyActivity } from '../../services/activityService';

interface WeeklyPoint {
  label: string;
  value: number;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Builds the last 7 local days as {label, proteinG}, filling unlogged days with 0. */
function buildWeeklyProtein(activity: { date: string; proteinG: number }[]): WeeklyPoint[] {
  const byDate = new Map(activity.map((a) => [a.date, a.proteinG]));
  const out: WeeklyPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ label: WEEKDAY_LABELS[d.getDay()], value: Math.round(byDate.get(key) ?? 0) });
  }
  return out;
}

export default function ProfileScreen({ navigation }: any) {
  const user = useUserStore((s) => s.user);
  const dailyGoals = useUserStore((s) => s.dailyGoals);
  const logout = useUserStore((s) => s.logout);
  const refreshStats = useUserStore((s) => s.refreshStats);

  const [weekly, setWeekly] = useState<WeeklyPoint[]>([]);

  // Re-read backend-owned XP/level/points/streak each time Profile is focused so
  // the stats reflect meals logged elsewhere without an app restart, and pull the
  // real last-7-days protein from user_daily_activity for the chart.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void refreshStats();
      (async () => {
        try {
          const activity = await getRecentDailyActivity(7);
          if (active) setWeekly(buildWeeklyProtein(activity));
        } catch {
          if (active) setWeekly(buildWeeklyProtein([]));
        }
      })();
      return () => {
        active = false;
      };
    }, [refreshStats]),
  );

  const achievements = useMemo(
    () =>
      user
        ? deriveAchievements({
            xp: user.xp,
            points: user.points,
            streakCount: user.streakCount,
            longestStreak: user.longestStreak,
            totalMealsLogged: user.totalMealsLogged,
            challengesWon: user.challengesWon,
            level: user.level,
          })
        : [],
    [user],
  );

  if (!user) return null;

  const xpForNext = getXpForLevel(user.level);
  const xpProgress = (user.xp % 500) / 500;
  const levelTitle = LEVEL_TITLES[user.level] ?? 'Legend';

  const settingsItems = [
    { label: 'Edit Macro Goals', icon: '🎯', screen: 'EditGoals' },
    { label: 'Scoring Rules', icon: '🏅', screen: 'RuleSettings' },
    { label: 'Notification Preferences', icon: '🔔', screen: 'NotificationSettings' },
    { label: 'Linked University', icon: '🏫', screen: 'UniversitySettings' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarLg}>
          <Text style={styles.avatarLgText}>{user.name[0]}</Text>
        </View>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.university}>{user.university}</Text>
        <Text style={styles.memberSince}>
          Member since {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Text>

        {/* Streak */}
        <View style={styles.streakSection}>
          <StreakFlame count={user.streakCount} size="large" />
        </View>

        {/* XP Bar */}
        <View style={styles.xpSection}>
          <Text style={styles.levelLabel}>Level {user.level} — {levelTitle}</Text>
          <View style={styles.xpBarBg}>
            <View style={[styles.xpBarFill, { width: `${xpProgress * 100}%` }]} />
          </View>
          <Text style={styles.xpText}>{user.xp} / {xpForNext} XP</Text>
        </View>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <StatCard label="Longest Streak" value={`${user.longestStreak} days`} icon="🔥" />
        <StatCard label="Meals Logged" value={`${user.totalMealsLogged}`} icon="🍽️" />
        <StatCard label="Challenges Won" value={`${user.challengesWon}`} icon="🏆" />
        <StatCard label="Total XP" value={`${user.xp.toLocaleString()}`} icon="⚡" />
      </View>

      {/* Points / Rewards Link */}
      <TouchableOpacity
        style={styles.rewardsLink}
        onPress={() => navigation.navigate('Rewards')}
      >
        <Text style={{ fontSize: 22 }}>🎁</Text>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.rewardsLinkTitle}>My Rewards</Text>
          <Text style={styles.rewardsLinkSub}>{user.points.toLocaleString()} points available</Text>
        </View>
        <Text style={styles.rewardsArrow}>›</Text>
      </TouchableOpacity>

      {/* Achievement Badges */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACHIEVEMENTS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgesRow}>
          {achievements.map((ach) => (
            <View
              key={ach.id}
              style={[styles.badgeCard, !ach.unlocked && styles.badgeLocked]}
            >
              <Text style={[styles.badgeIcon, !ach.unlocked && { opacity: 0.3 }]}>
                {ach.icon}
              </Text>
              <Text style={[styles.badgeName, !ach.unlocked && { color: Colors.textSecondary }]}>
                {ach.name}
              </Text>
              <Text style={styles.badgeDesc} numberOfLines={2}>{ach.description}</Text>
              {ach.unlocked && <Text style={styles.badgeDate}>Unlocked</Text>}
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Weekly Protein Chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>WEEKLY PROTEIN</Text>
        <View style={styles.chartCard}>
          <View style={styles.chartBars}>
            {weekly.map(({ label, value }, i) => {
              const goal = dailyGoals.protein;
              const pct = goal > 0 ? Math.min(value / goal, 1.2) : 0;
              const isHit = goal > 0 && value >= goal;
              const barColor =
                goal <= 0
                  ? Colors.surface2
                  : isHit
                    ? Colors.primary
                    : value >= goal * 0.8
                      ? Colors.accent
                      : Colors.error;
              return (
                <View key={i} style={styles.chartBarCol}>
                  <View style={styles.chartBarContainer}>
                    <View
                      style={[
                        styles.chartBar,
                        { height: `${Math.max(2, Math.min(pct * 100, 100))}%`, backgroundColor: barColor },
                      ]}
                    />
                  </View>
                  <Text style={styles.chartLabel}>{label}</Text>
                  <Text style={styles.chartValue}>{value}g</Text>
                </View>
              );
            })}
          </View>
          <View style={styles.goalLine}>
            <View style={styles.goalLineDash} />
            <Text style={styles.goalLineText}>
              {dailyGoals.protein > 0 ? `Goal: ${dailyGoals.protein}g` : 'Set a protein goal'}
            </Text>
          </View>
        </View>
      </View>

      {/* Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SETTINGS</Text>
        {settingsItems.map((item) => (
          <TouchableOpacity
            key={item.label}
            style={styles.settingsRow}
            onPress={() => navigation.navigate(item.screen)}
          >
            <Text style={{ fontSize: 18 }}>{item.icon}</Text>
            <Text style={styles.settingsText}>{item.label}</Text>
            <Text style={styles.settingsArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={async () => {
        try {
          await signOut();
        } catch {
          // Fallback to local logout
        }
        logout();
      }}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={statStyles.card}>
      <Text style={statStyles.icon}>{icon}</Text>
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  icon: { fontSize: 24, marginBottom: 6 },
  value: { fontFamily: FontFamily.displayBold, fontSize: 20, color: Colors.textPrimary },
  label: { fontFamily: FontFamily.body, fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingTop: 60 },
  profileHeader: { alignItems: 'center', marginBottom: 24 },
  avatarLg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.primary,
    marginBottom: 12,
  },
  avatarLgText: { fontFamily: FontFamily.displayBold, fontSize: 32, color: Colors.textPrimary },
  name: { fontFamily: FontFamily.displayBold, fontSize: 24, color: Colors.textPrimary },
  university: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  memberSince: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  streakSection: { marginTop: 16, marginBottom: 12 },
  xpSection: { width: '100%', marginTop: 8 },
  levelLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: Colors.primary, textAlign: 'center', marginBottom: 6 },
  xpBarBg: { height: 8, borderRadius: 4, backgroundColor: Colors.surface2, overflow: 'hidden' },
  xpBarFill: { height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  xpText: { fontFamily: FontFamily.body, fontSize: 11, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 12 },
  rewardsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gold + '0D',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.gold + '22',
    padding: 16,
    marginBottom: 20,
  },
  rewardsLinkTitle: { fontFamily: FontFamily.displayBold, fontSize: 15, color: Colors.gold },
  rewardsLinkSub: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  rewardsArrow: { fontFamily: FontFamily.displayBold, fontSize: 24, color: Colors.gold },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  badgesRow: { gap: 10, paddingRight: 20 },
  badgeCard: {
    width: 110,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    alignItems: 'center',
  },
  badgeLocked: { opacity: 0.5 },
  badgeIcon: { fontSize: 28, marginBottom: 6 },
  badgeName: { fontFamily: FontFamily.bodySemiBold, fontSize: 11, color: Colors.textPrimary, textAlign: 'center' },
  badgeDesc: { fontFamily: FontFamily.body, fontSize: 9, color: Colors.textSecondary, textAlign: 'center', marginTop: 3 },
  badgeDate: { fontFamily: FontFamily.body, fontSize: 8, color: Colors.primary, marginTop: 4 },
  // Chart
  chartCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  chartBars: { flexDirection: 'row', justifyContent: 'space-between', height: 120 },
  chartBarCol: { alignItems: 'center', flex: 1 },
  chartBarContainer: { flex: 1, justifyContent: 'flex-end', width: 20 },
  chartBar: { width: 20, borderRadius: 4 },
  chartLabel: { fontFamily: FontFamily.body, fontSize: 10, color: Colors.textSecondary, marginTop: 4 },
  chartValue: { fontFamily: FontFamily.body, fontSize: 9, color: Colors.textSecondary },
  goalLine: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  goalLineDash: { flex: 1, height: 1, borderStyle: 'dashed', borderWidth: 1, borderColor: Colors.primary + '44' },
  goalLineText: { fontFamily: FontFamily.body, fontSize: 10, color: Colors.primary },
  // Settings
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  settingsText: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.textPrimary, flex: 1 },
  settingsArrow: { fontFamily: FontFamily.body, fontSize: 20, color: Colors.textSecondary },
  logoutBtn: {
    borderWidth: 1,
    borderColor: Colors.error + '44',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutText: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.error },
});
