import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Colors, FontFamily, FontSize, Spacing, Radius, alpha } from '../../theme';
import { useUserStore } from '../../store/userStore';
import LeaderboardRow from '../../components/LeaderboardRow';
import AppIcon from '../../components/ui/AppIcon';
import RotatingTrophy from '../../components/animations/RotatingTrophy';
import {
  getLeaderboard,
  LeaderboardUser,
  LeaderboardWindow,
  LEADERBOARD_WINDOWS,
  publicLeaderboardName,
} from '../../services/leaderboardService';
import {
  searchUsers,
  sendFriendRequest,
  respondFriendRequest,
  getFriendRequests,
  getFriendsLeaderboard,
  UserSearchResult,
  FriendRequest,
  FriendStanding,
  FriendshipStatus,
} from '../../services/friendService';

type Tab = 'global' | 'friends' | 'team';
const TABS: { key: Tab; label: string }[] = [
  { key: 'global', label: 'Global' },
  { key: 'friends', label: 'Friends' },
  { key: 'team', label: 'My Team' },
];

export default function LeaderboardScreen() {
  const navigation = useNavigation<any>();
  const user = useUserStore((s) => s.user);
  const firstName = (user?.name ?? 'You').split(' ')[0];

  const [tab, setTab] = useState<Tab>('global');

  // ── Global board state ──────────────────────────────
  const [windowDays, setWindowDays] = useState<LeaderboardWindow>(14);
  const [rows, setRows] = useState<LeaderboardUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
              <RotatingTrophy size={40} />
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
                  name={r.userId === user?.id ? firstName : publicLeaderboardName(r)}
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
                  name={r.userId === user?.id ? firstName : publicLeaderboardName(r)}
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

      {tab === 'friends' && (
        <FriendsTab
          currentUserId={user?.id ?? null}
          firstName={firstName}
          onChallengeFriend={(id, name) =>
            navigation.navigate('Challenges', { inviteFriend: { id, name } })
          }
        />
      )}

      {tab === 'team' && (
        <View style={styles.center}>
          <AppIcon name="challenges" size={40} color={Colors.textSecondary} />
          <Text style={styles.emptyTitle}>Team leaderboard</Text>
          <Text style={styles.notice}>
            Join a challenge to compete with your team. Per-team standings are coming soon.
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Friends tab ─────────────────────────────────────────────────────
function FriendsTab({
  currentUserId,
  firstName,
  onChallengeFriend,
}: {
  currentUserId: string | null;
  firstName: string;
  onChallengeFriend: (friendId: string, friendName: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [standings, setStandings] = useState<FriendStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reqs, board] = await Promise.all([getFriendRequests(), getFriendsLeaderboard(14)]);
      setRequests(reqs);
      setStandings(board);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load friends.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        await load();
      })();
      return () => {
        active = false;
      };
    }, [load]),
  );

  const runSearch = useCallback(async (text: string) => {
    setQuery(text);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const found = await searchUsers(text);
      setResults(found);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Optimistically update a search result's status after an action.
  const setResultStatus = (userId: string, status: FriendshipStatus) =>
    setResults((prev) => prev.map((r) => (r.userId === userId ? { ...r, status } : r)));

  const onAdd = async (r: UserSearchResult) => {
    setBusyId(r.userId);
    try {
      const status = await sendFriendRequest(r.userId);
      setResultStatus(r.userId, status);
      if (status === 'friends') await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send request.');
    } finally {
      setBusyId(null);
    }
  };

  const onRespond = async (requesterId: string, accept: boolean) => {
    setBusyId(requesterId);
    try {
      await respondFriendRequest(requesterId, accept);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update request.');
    } finally {
      setBusyId(null);
    }
  };

  const showingSearch = query.trim().length >= 2;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Search bar */}
      <View style={styles.searchBar}>
        <AppIcon name="search" size={18} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or username"
          placeholderTextColor={Colors.textSecondary}
          value={query}
          onChangeText={runSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => runSearch('')}>
            <Text style={styles.clearX}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {error && <Text style={[styles.notice, { marginBottom: Spacing.sm }]}>{error}</Text>}

      {/* Search results */}
      {showingSearch ? (
        searching ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.lg }} />
        ) : results.length === 0 ? (
          <Text style={[styles.notice, { marginTop: Spacing.lg }]}>No users found.</Text>
        ) : (
          results.map((r) => (
            <View key={r.userId} style={styles.row}>
              <Avatar name={r.name} url={r.avatarUrl} />
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{r.name}</Text>
                {r.university ? <Text style={styles.rowSub}>{r.university}</Text> : null}
              </View>
              <StatusButton
                status={r.status}
                busy={busyId === r.userId}
                onAdd={() => onAdd(r)}
                onAccept={() => onRespond(r.userId, true)}
              />
            </View>
          ))
        )
      ) : loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.lg }} />
      ) : (
        <>
          {/* Incoming requests */}
          {requests.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>FRIEND REQUESTS</Text>
              {requests.map((req) => (
                <View key={req.userId} style={styles.row}>
                  <Avatar name={req.name} url={req.avatarUrl} />
                  <View style={styles.rowMain}>
                    <Text style={styles.rowName}>{req.name}</Text>
                    <Text style={styles.rowSub}>wants to be friends</Text>
                  </View>
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.smallBtnPrimary]}
                      disabled={busyId === req.userId}
                      onPress={() => onRespond(req.userId, true)}
                    >
                      <Text style={styles.smallBtnPrimaryText}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.smallBtn}
                      disabled={busyId === req.userId}
                      onPress={() => onRespond(req.userId, false)}
                    >
                      <Text style={styles.smallBtnText}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* Friends leaderboard */}
          <Text style={[styles.sectionLabel, { marginTop: requests.length ? Spacing.lg : 0 }]}>
            FRIENDS LEADERBOARD
          </Text>
          {standings.length <= 1 ? (
            <View style={[styles.center, { paddingVertical: Spacing.xl }]}>
              <AppIcon name="users" size={36} color={Colors.textSecondary} />
              <Text style={styles.emptyTitle}>No friends yet</Text>
              <Text style={styles.notice}>Search above to add friends and compete head-to-head.</Text>
            </View>
          ) : (
            standings.map((s) => {
              const isMe = s.userId === currentUserId;
              return (
                <View key={s.userId} style={[styles.row, isMe && styles.rowMe]}>
                  <Text style={styles.rank}>#{s.rank}</Text>
                  <Avatar name={isMe ? firstName : s.name} url={s.avatarUrl} />
                  <View style={styles.rowMain}>
                    <Text style={styles.rowName}>{isMe ? `${firstName} (you)` : s.name}</Text>
                    <Text style={styles.rowSub}>
                      {s.score.toLocaleString()} pts · 🔥 {s.streakCount}
                    </Text>
                  </View>
                  {!isMe && (
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.smallBtnPrimary]}
                      onPress={() => onChallengeFriend(s.userId, s.name)}
                    >
                      <AppIcon name="challenges" size={14} color={Colors.background} />
                      <Text style={styles.smallBtnPrimaryText}>Challenge</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </>
      )}

      <View style={{ height: Spacing.xxl }} />
    </ScrollView>
  );
}

function StatusButton({
  status,
  busy,
  onAdd,
  onAccept,
}: {
  status: FriendshipStatus;
  busy: boolean;
  onAdd: () => void;
  onAccept: () => void;
}) {
  if (busy) return <ActivityIndicator color={Colors.primary} style={{ width: 84 }} />;
  if (status === 'friends')
    return (
      <View style={[styles.smallBtn, styles.smallBtnGhost]}>
        <AppIcon name="checkmark" size={14} color={Colors.textSecondary} />
        <Text style={styles.smallBtnText}>Friends</Text>
      </View>
    );
  if (status === 'outgoing')
    return (
      <View style={[styles.smallBtn, styles.smallBtnGhost]}>
        <Text style={styles.smallBtnText}>Requested</Text>
      </View>
    );
  if (status === 'incoming')
    return (
      <TouchableOpacity style={[styles.smallBtn, styles.smallBtnPrimary]} onPress={onAccept}>
        <Text style={styles.smallBtnPrimaryText}>Accept</Text>
      </TouchableOpacity>
    );
  return (
    <TouchableOpacity style={[styles.smallBtn, styles.smallBtnPrimary]} onPress={onAdd}>
      <AppIcon name="plus" size={14} color={Colors.background} />
      <Text style={styles.smallBtnPrimaryText}>Add</Text>
    </TouchableOpacity>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase();
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initial}</Text>
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

  // Friends tab
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: Spacing.md,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontFamily: FontFamily.body, fontSize: FontSize.label, padding: 0 },
  clearX: { color: Colors.textSecondary, fontSize: FontSize.label, paddingHorizontal: 4 },

  sectionLabel: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.meta,
    color: Colors.textSecondary,
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  rowMe: { borderColor: alpha(Colors.primary, 0.4), backgroundColor: alpha(Colors.primary, 0.08) },
  rowMain: { flex: 1 },
  rowName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.label, color: Colors.textPrimary },
  rowSub: { fontFamily: FontFamily.body, fontSize: FontSize.meta, color: Colors.textSecondary, marginTop: 1 },
  rank: { fontFamily: FontFamily.displayBold, fontSize: FontSize.label, color: Colors.textSecondary, width: 32 },

  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: alpha(Colors.primary, 0.18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: FontFamily.displayBold, fontSize: FontSize.label, color: Colors.primary },

  actionsRow: { flexDirection: 'row', gap: Spacing.xs },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  smallBtnText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.meta, color: Colors.textSecondary },
  smallBtnPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  smallBtnPrimaryText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.meta, color: Colors.background },
  smallBtnGhost: { backgroundColor: 'transparent' },
});
