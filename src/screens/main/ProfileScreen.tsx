import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Type, Spacing, Radius, FontFamily, useTheme } from '../../theme';
import { useUserStore } from '../../store/userStore';
import { signOut } from '../../lib/auth';
import { requestAccountDeletion } from '../../services/accountService';
import StreakFlame from '../../components/StreakFlame';
import AvatarPickerSheet from '../../components/AvatarPickerSheet';
import { LEVEL_TITLES, getXpForLevel } from '../../lib/leveling';
import { deriveAchievements } from '../../lib/achievements';
import { getRecentDailyActivity } from '../../services/activityService';
import PixelFlame from '../../components/PixelFlame';
import ElectricBolt from '../../components/animations/ElectricBolt';
import RotatingTrophy from '../../components/animations/RotatingTrophy';
import ClashingUtensils from '../../components/animations/ClashingUtensils';
import {
  Screen,
  Text,
  Card,
  ProgressBar,
  Badge,
  Avatar,
  SegmentedControl,
  Sheet,
  AppIcon,
  AppIconName,
  Divider,
  IconButton,
} from '../../components/ui';

interface WeeklyPoint {
  label: string;
  value: number;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const APPEARANCE_MODES = ['light', 'dark', 'system'] as const;

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
  const { colors, mode, setMode } = useTheme();

  const user = useUserStore((s) => s.user);
  const dailyGoals = useUserStore((s) => s.dailyGoals);
  const logout = useUserStore((s) => s.logout);
  const refreshStats = useUserStore((s) => s.refreshStats);
  const setAccountLifecycle = useUserStore((s) => s.setAccountLifecycle);

  const [weekly, setWeekly] = useState<WeeklyPoint[]>([]);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Two-step confirmation before archiving the account. On success we flip the
  // local lifecycle flag so App.tsx routes to the reactivation gate immediately.
  const onConfirmDelete = useCallback(async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const scheduledAt = await requestAccountDeletion();
      setAccountLifecycle(true, scheduledAt);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setIsDeleting(false);
    }
  }, [setAccountLifecycle]);

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
  const xpAtLevelStart = getXpForLevel(user.level - 1);
  const xpNeededThisLevel = Math.max(1, xpForNext - xpAtLevelStart);
  const xpIntoLevel = Math.max(0, Math.min(xpNeededThisLevel, user.xp - xpAtLevelStart));
  const xpProgress = xpIntoLevel / xpNeededThisLevel;
  const levelTitle = LEVEL_TITLES[user.level] ?? 'Legend';

  const stats: { label: string; value: string; icon: React.ReactNode }[] = [
    { label: 'Longest streak', value: `${user.longestStreak}`, icon: <PixelFlame size={22} animated /> },
    { label: 'Meals logged', value: `${user.totalMealsLogged}`, icon: <ClashingUtensils size={22} /> },
    { label: 'Challenges won', value: `${user.challengesWon}`, icon: <RotatingTrophy size={22} color={colors.ink} /> },
    { label: 'Total XP', value: user.xp.toLocaleString(), icon: <ElectricBolt size={22} /> },
  ];

  const settingsItems: { label: string; icon: AppIconName; screen: string }[] = [
    { label: 'Edit macro goals', icon: 'target', screen: 'EditGoals' },
    { label: 'Scoring rules', icon: 'medal', screen: 'RuleSettings' },
    { label: 'Notification preferences', icon: 'bell', screen: 'NotificationSettings' },
    { label: 'Linked university', icon: 'school', screen: 'UniversitySettings' },
  ];

  const memberSince = new Date(user.createdAt).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <Screen scroll bottomSpace={96}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconButton
          icon="chevron-left"
          onPress={() => navigation.goBack()}
          accessibilityLabel="Back"
          style={{ marginLeft: -4 }}
        />
      </View>
      {/* Identity header */}
      <View style={styles.identity}>
        <Pressable onPress={() => setPickerOpen(true)} accessibilityLabel="Change profile picture">
          <Avatar name={user.name} url={user.avatarUrl} size={80} ring={colors.borderCard} ringWidth={2} />
          <View
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: colors.scarlet,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: colors.canvas,
            }}
          >
            <AppIcon name={user.avatarUrl ? 'edit' : 'plus'} size={14} color={colors.onPrimary} />
          </View>
        </Pressable>
        <Text variant="title" color={colors.ink} center style={{ marginTop: Spacing.md }}>
          {user.name}
        </Text>
        <Text variant="label" color={colors.textSecondary} center style={{ marginTop: 2 }}>
          {user.university}
        </Text>
        <Text variant="labelSm" color={colors.textTertiary} center style={{ marginTop: 2 }}>
          Member since {memberSince}
        </Text>
        <View style={{ marginTop: Spacing.base }}>
          <StreakFlame count={user.streakCount} size="large" />
        </View>
        {!user.avatarUrl ? (
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginTop: Spacing.md,
              backgroundColor: colors.brandTint,
              borderRadius: 99,
              paddingVertical: 8,
              paddingHorizontal: 14,
            }}
          >
            <AppIcon name="plus" size={15} color={colors.scarlet} />
            <Text variant="label" color={colors.scarlet} style={{ fontFamily: FontFamily.semibold }}>
              Add a profile picture
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Level / XP progression */}
      <Card style={styles.block}>
        <View style={styles.levelHeader}>
          <Badge label={`LEVEL ${user.level}`} tone="scarlet" numeral />
          <Text variant="subhead" color={colors.ink} style={{ flex: 1 }}>
            {levelTitle}
          </Text>
          <Text style={[Type.numInline, { color: colors.textSecondary }]}>
            {xpIntoLevel} / {xpNeededThisLevel} XP
          </Text>
        </View>
        <ProgressBar progress={xpProgress} color={colors.scarlet} height={10} style={{ marginTop: 12 }} />
        <Text variant="labelSm" color={colors.textTertiary} style={{ marginTop: 8 }}>
          {Math.max(0, xpNeededThisLevel - xpIntoLevel)} XP to Level {user.level + 1}
        </Text>
      </Card>

      {/* 2×2 stat grid */}
      <View style={styles.statsGrid}>
        {stats.map((s) => (
          <Card key={s.label} style={styles.statCard}>
            <View style={styles.statIcon}>{s.icon}</View>
            <Text style={[Type.scoreStat, { color: colors.ink }]}>{s.value}</Text>
            <Text variant="labelSm" color={colors.textSecondary} center style={{ marginTop: 2 }}>
              {s.label}
            </Text>
          </Card>
        ))}
      </View>

      {/* Rewards link */}
      <Card onPress={() => navigation.navigate('Rewards')} style={styles.rewardsRow}>
        <View style={[styles.rewardsIcon, { backgroundColor: colors.goldTint }]}>
          <AppIcon name="gift" size={22} color={colors.gold} />
        </View>
        <View style={{ flex: 1, marginLeft: Spacing.md }}>
          <Text variant="subhead" color={colors.ink}>
            My rewards
          </Text>
          <Text variant="label" color={colors.textSecondary}>
            {user.points.toLocaleString()} LP available
          </Text>
        </View>
        <AppIcon name="chevron-right" size={20} color={colors.textTertiary} />
      </Card>

      {/* Achievements */}
      <Text variant="overline" color={colors.textSecondary} style={styles.sectionLabel}>
        Achievements
      </Text>
      <View style={styles.achievementsRow}>
        {achievements.map((ach) => (
          <Card key={ach.id} style={[styles.achCard, !ach.unlocked && { opacity: 0.55 }]}>
            <View style={styles.achIcon}>
              {ach.icon === 'streak' ? (
                <PixelFlame size={28} animated={ach.unlocked} />
              ) : ach.icon === 'trophy' ? (
                <RotatingTrophy size={26} color={ach.unlocked ? colors.ink : colors.textTertiary} />
              ) : (
                <AppIcon
                  name={ach.icon}
                  size={26}
                  color={ach.unlocked ? colors.ink : colors.textTertiary}
                />
              )}
            </View>
            <Text variant="cardTitle" color={ach.unlocked ? colors.ink : colors.textSecondary} center>
              {ach.name}
            </Text>
            <Text variant="labelSm" color={colors.textTertiary} center numberOfLines={2} style={{ marginTop: 2 }}>
              {ach.description}
            </Text>
            <View style={{ marginTop: 8 }}>
              <Badge label={ach.unlocked ? 'Unlocked' : 'Locked'} tone={ach.unlocked ? 'success' : 'neutral'} />
            </View>
          </Card>
        ))}
      </View>

      {/* Weekly protein chart */}
      <Text variant="overline" color={colors.textSecondary} style={styles.sectionLabel}>
        Weekly protein
      </Text>
      <Card style={styles.block}>
        <View style={styles.chartBars}>
          {weekly.map(({ label, value }, i) => {
            const goal = dailyGoals.protein;
            const isToday = i === weekly.length - 1;
            const isHit = goal > 0 && value >= goal;
            const noData = value <= 0;
            const pct = goal > 0 ? Math.min(value / goal, 1) : 0;
            const barColor = isHit
              ? colors.ink
              : isToday
                ? colors.scarlet
                : colors.macroCarb;
            return (
              <View key={i} style={styles.chartCol}>
                {isHit && <AppIcon name="checkmark" size={12} color={colors.success} />}
                <View style={styles.chartTrack}>
                  <View
                    style={[
                      styles.chartFill,
                      {
                        height: `${Math.max(4, pct * 100)}%`,
                        backgroundColor: noData ? colors.track : barColor,
                        borderWidth: noData ? 1 : 0,
                        borderColor: colors.borderInput,
                        borderStyle: 'dashed',
                      },
                    ]}
                  />
                </View>
                <Text variant="labelSm" color={isToday ? colors.scarlet : colors.textSecondary} center>
                  {label}
                </Text>
                <Text style={[Type.numInline, { color: colors.textTertiary, fontSize: 12 }]}>{value}</Text>
              </View>
            );
          })}
        </View>
        <Divider style={{ marginTop: Spacing.md }} />
        <Text variant="labelSm" color={colors.textTertiary} style={{ marginTop: 8 }}>
          {dailyGoals.protein > 0
            ? `Checks mark goal days. Goal: ${dailyGoals.protein}g protein.`
            : 'Set a protein goal to track goal days.'}
        </Text>
      </Card>

      {/* Settings */}
      <Text variant="overline" color={colors.textSecondary} style={styles.sectionLabel}>
        Settings
      </Text>
      <Card padded={false} style={styles.block}>
        {settingsItems.map((item, i) => (
          <View key={item.label}>
            {i > 0 && <Divider inset={Spacing.base} />}
            <Pressable
              onPress={() => navigation.navigate(item.screen)}
              style={({ pressed }) => [styles.settingsRow, pressed && { opacity: 0.6 }]}
            >
              <AppIcon name={item.icon} size={19} color={colors.textSecondary} />
              <Text variant="subhead" color={colors.ink} style={{ flex: 1, marginLeft: Spacing.md }}>
                {item.label}
              </Text>
              <AppIcon name="chevron-right" size={20} color={colors.textTertiary} />
            </Pressable>
          </View>
        ))}
      </Card>

      {/* Appearance */}
      <Text variant="overline" color={colors.textSecondary} style={styles.sectionLabel}>
        Appearance
      </Text>
      <Card style={styles.block}>
        <SegmentedControl
          segments={['Light', 'Dark', 'System']}
          value={Math.max(0, APPEARANCE_MODES.indexOf(mode))}
          onChange={(idx) => setMode(APPEARANCE_MODES[idx])}
        />
      </Card>

      {/* Sign out / Delete */}
      <Pressable
        onPress={async () => {
          try {
            await signOut();
          } catch {
            // Fallback to local logout
          }
          logout();
        }}
        style={({ pressed }) => [
          styles.signOut,
          { borderColor: colors.borderInput },
          pressed && { opacity: 0.6 },
        ]}
      >
        <AppIcon name="sign-out" size={18} color={colors.ink} />
        <Text variant="button" color={colors.ink}>
          Sign out
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          setDeleteError(null);
          setShowDelete(true);
        }}
        style={({ pressed }) => [styles.deleteRow, pressed && { opacity: 0.6 }]}
      >
        <Text variant="label" color={colors.error}>
          Delete account
        </Text>
      </Pressable>

      {/* Delete account confirmation sheet (spec 27) */}
      <Sheet visible={showDelete} onClose={() => setShowDelete(false)} title="Delete account?">
        <View style={styles.sheetBody}>
          <Text variant="body" color={colors.textSecondary}>
            Your account will be archived and permanently deleted in 14 days. You can sign back in any
            time before then to recover everything.
          </Text>
          {deleteError && (
            <View style={[styles.errorBanner, { backgroundColor: colors.brandTint, borderColor: colors.brandTintBorder }]}>
              <AppIcon name="circle-alert" size={15} color={colors.error} />
              <Text variant="labelSm" color={colors.errorMuted} style={{ flex: 1 }}>
                {deleteError}
              </Text>
            </View>
          )}
          <Pressable
            disabled={isDeleting}
            onPress={onConfirmDelete}
            style={({ pressed }) => [
              styles.destructiveBtn,
              { backgroundColor: colors.error, opacity: isDeleting ? 0.6 : pressed ? 0.85 : 1 },
            ]}
          >
            <Text variant="button" color={colors.onPrimary}>
              {isDeleting ? 'Deleting…' : 'Delete account'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setShowDelete(false)}
            style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.6 }]}
          >
            <Text variant="button" color={colors.ink}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </Sheet>

      <AvatarPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        userId={user.id}
        name={user.name}
        currentUrl={user.avatarUrl}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', marginTop: Spacing.sm, marginBottom: Spacing.lg },
  block: { marginBottom: Spacing.base },
  levelHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  statCard: { width: '48.5%', alignItems: 'center', paddingVertical: Spacing.base, marginBottom: Spacing.md },
  statIcon: { height: 34, marginBottom: 6, alignItems: 'center', justifyContent: 'center' },
  rewardsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg },
  rewardsIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: { marginBottom: Spacing.md, marginTop: Spacing.xs },
  achievementsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: Spacing.xs },
  achCard: { width: '48.5%', alignItems: 'center', paddingVertical: Spacing.base, marginBottom: Spacing.md },
  achIcon: { height: 34, marginBottom: 8, alignItems: 'center', justifyContent: 'center' },
  chartBars: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 132 },
  chartCol: { flex: 1, alignItems: 'center', gap: 4 },
  chartTrack: { flex: 1, width: 18, justifyContent: 'flex-end' },
  chartFill: { width: 18, borderRadius: 5, minHeight: 4 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: Spacing.base },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: Radius.button,
    borderWidth: 1.5,
    marginTop: Spacing.sm,
  },
  deleteRow: { alignItems: 'center', paddingVertical: Spacing.base, marginTop: Spacing.xs },
  sheetBody: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.base, gap: Spacing.md },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: 12,
  },
  destructiveBtn: {
    height: 54,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  cancelBtn: { height: 50, alignItems: 'center', justifyContent: 'center' },
});
