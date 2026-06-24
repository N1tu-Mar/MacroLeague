import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, FontFamily, FontSize, Spacing, Radius, alpha } from '../../theme';
import { useUserStore } from '../../store/userStore';
import LeaderboardRow from '../../components/LeaderboardRow';
import {
  getLeaderboard,
  LeaderboardUser,
  LeaderboardWindow,
  LEADERBOARD_WINDOWS,
} from '../../services/leaderboardService';

type Tab = 'global' | 'friends' | 'team';
const TABS: { key: Tab; label: string }[] = [
  { key: 'global', label: 'Global' },
  { key: 'friends', label: 'Friends' },
  { key: 'team', label: 'My Team' },
];

export default function LeaderboardScreen() {
  const user = useUserStore((s) => s.user);
  const firstName = (user?.name ?? 'You').split(' ')[0];

  const [tab, setTab] = useState<Tab>('global');
  const [windowDays, setWindowDays] = useState<LeaderboardWindow>(14);
  const [rows, setRows] = useState<LeaderboardUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reload the global board on focus and whenever the window changes, so a score
  // earned elsewhere shows up without an app restart.
  useFocusEffect(
    useCallback(() => {
      if (tab !== 'global') return;
      let active = true;
      setIsLoading(true);
      setError(null);
      (async () => {
        try {
          const data = await getLeaderboard(windowDays);
          if (active) setRows(data);
        } catch (e) {
          if (active) setError(e instanceof Error ? e.message : 'Could not load the leaderboard.');
        } finally {
          if (active) setIsLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [tab, windowDays]),
  );

  const me = rows.find((r) => r.userId === user?.id) ?? null;
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>LEADERBOARD</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'global' && (
        <>
          {/* Window selector */}
          <View style={styles.windowRow}>
            {LEADERBOARD_WINDOWS.map((w) => (
              <TouchableOpacity
                key={w.days}
                style={[styles.windowChip, windowDays === w.days && styles.windowChipActive]}
                onPress={() => setWindowDays(w.days)}
              >
                <Text style={[styles.windowText, windowDays === w.days && styles.windowTextActive]}>
                  {w.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Text style={styles.notice}>{error}</Text>
            </View>
          ) : rows.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>🏆</Text>
              <Text style={styles.emptyTitle}>No rankings yet</Text>
              <Text style={styles.notice}>Log meals to earn points and enter the leaderboard.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              {me && (
                <View style={styles.youCard}>
                  <Text style={styles.youLabel}>YOUR RANK</Text>
                  <Text style={styles.youRank}>#{me.rank}</Text>
                  <Text style={styles.youPts}>{me.score.toLocaleString()} pts</Text>
                </View>
              )}

              {top.map((r) => (
                <LeaderboardRow
                  key={r.userId}
                  rank={r.rank}
                  name={r.userId === user?.id ? firstName : r.displayName ?? r.username}
                  points={r.score}
                  streak={r.streakCount}
                  movement={0}
                  isCurrentUser={r.userId === user?.id}
                  avatarUrl={r.avatarUrl}
                />
              ))}

              {rest.length > 0 && <View style={styles.divider} />}

              {rest.map((r) => (
                <LeaderboardRow
                  key={r.userId}
                  rank={r.rank}
                  name={r.userId === user?.id ? firstName : r.displayName ?? r.username}
                  points={r.score}
                  streak={r.streakCount}
                  movement={0}
                  isCurrentUser={r.userId === user?.id}
                  avatarUrl={r.avatarUrl}
                />
              ))}

              <View style={{ height: Spacing.xxl }} />
            </ScrollView>
          )}
        </>
      )}

      {tab !== 'global' && (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>{tab === 'friends' ? '👥' : '⚔️'}</Text>
          <Text style={styles.emptyTitle}>
            {tab === 'friends' ? 'Friends leaderboard' : 'Team leaderboard'}
          </Text>
          <Text style={styles.notice}>
            {tab === 'friends'
              ? 'Coming soon — add friends to compete head-to-head.'
              : 'Join a challenge to compete with your team. Per-team standings are coming soon.'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingTop: 60, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  title: { fontFamily: FontFamily.displayBold, fontSize: FontSize.title, color: Colors.textPrimary, letterSpacing: 1 },

  tabsRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: { backgroundColor: alpha(Colors.primary, 0.12), borderColor: alpha(Colors.primary, 0.4) },
  tabText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.label, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary },

  windowRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  windowChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  windowChipActive: { backgroundColor: alpha(Colors.primary, 0.12), borderColor: alpha(Colors.primary, 0.4) },
  windowText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.meta, color: Colors.textSecondary },
  windowTextActive: { color: Colors.primary },

  content: { paddingHorizontal: Spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.sm },
  notice: { fontFamily: FontFamily.body, fontSize: FontSize.label, color: Colors.textSecondary, textAlign: 'center' },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontFamily: FontFamily.displayBold, fontSize: FontSize.subhead, color: Colors.textPrimary },

  youCard: {
    backgroundColor: alpha(Colors.primary, 0.1),
    borderColor: alpha(Colors.primary, 0.4),
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    alignItems: 'center',
    marginBottom: Spacing.base,
  },
  youLabel: { fontFamily: FontFamily.displayBold, fontSize: FontSize.meta, color: Colors.textSecondary, letterSpacing: 1.4 },
  youRank: { fontFamily: FontFamily.displayBold, fontSize: FontSize.display, color: Colors.primary },
  youPts: { fontFamily: FontFamily.body, fontSize: FontSize.label, color: Colors.textSecondary },

  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.md },
});
