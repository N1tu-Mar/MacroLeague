import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { FontFamily, Radius, Spacing, alpha, useTheme } from '../../theme';
import { useUserStore } from '../../store/userStore';
import LeaderboardRow from '../../components/LeaderboardRow';
import {
  Screen,
  Card,
  Text,
  Button,
  SegmentedControl,
  Avatar,
  StreakPill,
  Sheet,
  TextField,
  IconButton,
  AppIcon,
  Divider,
} from '../../components/ui';
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
  { key: 'team', label: 'Team' },
];

/** Public profile shown in the friend sheet (public stats only). */
type Profile = {
  id: string;
  name: string;
  university: string | null;
  streak: number;
  lp: number;
  avatarUrl: string | null;
  isSelf: boolean;
};

export default function LeaderboardScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const user = useUserStore((s) => s.user);
  const firstName = (user?.name ?? 'You').split(' ')[0];

  const [tab, setTab] = useState<Tab>('global');
  // Pending incoming friend-request count, surfaced as a badge on the Friends
  // tab. Refreshed on screen focus (any tab) and after FriendsTab loads/acts.
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const openChallenge = useCallback(
    (id: string, name: string) => {
      setProfile(null);
      navigation.navigate('Challenges', { inviteFriend: { id, name } });
    },
    [navigation],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const reqs = await getFriendRequests();
          if (active) setFriendRequestCount(reqs.length);
        } catch {
          // Badge simply won't show if this fails (e.g. migration 0011 absent).
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

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

  const meIdx = rows.findIndex((r) => r.userId === user?.id);
  const me = meIdx >= 0 ? rows[meIdx] : null;
  const above = meIdx > 0 ? rows[meIdx - 1] : null;
  const below = meIdx >= 0 && meIdx < rows.length - 1 ? rows[meIdx + 1] : null;
  const ptsToAbove = me && above ? above.score - me.score : null;
  const ptsToBelow = me && below ? me.score - below.score : null;

  const windowIndex = Math.max(
    0,
    LEADERBOARD_WINDOWS.findIndex((w) => w.days === windowDays),
  );

  const openProfile = (r: LeaderboardUser) => {
    const isSelf = r.userId === user?.id;
    setProfile({
      id: r.userId,
      name: isSelf ? firstName : publicLeaderboardName(r),
      university: r.university,
      streak: r.streakCount,
      lp: r.score,
      avatarUrl: r.avatarUrl,
      isSelf,
    });
  };

  return (
    <Screen scroll bottomSpace={96}>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="heading" color={colors.ink}>
          League
        </Text>
        <IconButton
          icon="info"
          onPress={() => setInfoOpen(true)}
          size={40}
          iconSize={20}
          border
          color={colors.textSecondary}
          accessibilityLabel="How scoring works"
        />
      </View>

      {/* Global / Friends / Team text tabs with scarlet underline */}
      <View style={styles.tabsRow}>
        {TABS.map((t) => {
          const active = tab === t.key;
          const showBadge = t.key === 'friends' && friendRequestCount > 0;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
              <View style={styles.tabLabelRow}>
                <Text
                  variant="subhead"
                  color={active ? colors.ink : colors.textSecondary}
                >
                  {t.label}
                </Text>
                {showBadge ? (
                  <View style={[styles.tabBadge, { backgroundColor: colors.scarlet }]}>
                    <Text style={[styles.tabBadgeText, { color: colors.onPrimary }]}>
                      {friendRequestCount}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View
                style={[
                  styles.tabUnderline,
                  { backgroundColor: active ? colors.scarlet : 'transparent' },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      {tab === 'global' && (
        <>
          {/* Duration */}
          <SegmentedControl
            segments={LEADERBOARD_WINDOWS.map((w) => w.label)}
            value={windowIndex}
            onChange={(i) => setWindowDays(LEADERBOARD_WINDOWS[i].days)}
            style={{ marginBottom: Spacing.base }}
          />

          {/* Dark rank summary card */}
          {me && (
            <View style={[styles.rankCard, { backgroundColor: colors.ink }]}>
              <View style={styles.rankCardLeft}>
                <Text variant="overline" color={alpha(colors.onPrimary, 0.6)}>
                  Your Rank
                </Text>
                <Text
                  color={colors.onPrimary}
                  style={styles.rankBig}
                  allowFontScaling={false}
                >
                  #{me.rank}
                </Text>
              </View>
              <View style={[styles.rankDivider, { backgroundColor: alpha(colors.onPrimary, 0.14) }]} />
              <View style={styles.rankCardRight}>
                <View style={styles.rankStatRow}>
                  <Text variant="labelSm" color={alpha(colors.onPrimary, 0.6)}>
                    League Points
                  </Text>
                  <View style={styles.lpInline}>
                    <Text color={colors.onPrimary} style={styles.lpInlineValue} allowFontScaling={false}>
                      {me.score.toLocaleString()}
                    </Text>
                    <Text variant="labelSm" color={alpha(colors.onPrimary, 0.6)}>
                      LP
                    </Text>
                  </View>
                </View>
                <View style={styles.deltaRow}>
                  <AppIcon name="arrow-up" size={14} color={colors.success} />
                  <Text variant="labelSm" color={alpha(colors.onPrimary, 0.75)} style={{ flex: 1 }}>
                    To the rank above
                  </Text>
                  <Text color={colors.success} style={styles.deltaValue} allowFontScaling={false}>
                    {ptsToAbove != null ? `+${ptsToAbove}` : '—'}
                  </Text>
                </View>
                <View style={styles.deltaRow}>
                  <AppIcon name="arrow-down" size={14} color={alpha(colors.onPrimary, 0.55)} />
                  <Text variant="labelSm" color={alpha(colors.onPrimary, 0.75)} style={{ flex: 1 }}>
                    Rank below
                  </Text>
                  <Text color={alpha(colors.onPrimary, 0.75)} style={styles.deltaValue} allowFontScaling={false}>
                    {ptsToBelow != null ? `+${ptsToBelow}` : '—'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Standings */}
          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.scarlet} />
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Text variant="body" color={colors.textSecondary} center>
                {error}
              </Text>
            </View>
          ) : rows.length === 0 ? (
            <EmptyState
              icon="trophy"
              title="No standings yet."
              body="Log and confirm your first meal to enter this window. Every confirmed meal earns 10 LP."
            />
          ) : (
            <Card padded={false} style={{ overflow: 'hidden' }}>
              {rows.map((r, i) => (
                <View key={r.userId}>
                  {i > 0 && <Divider color={colors.rowDivider} />}
                  <LeaderboardRow
                    rank={r.rank}
                    name={r.userId === user?.id ? firstName : publicLeaderboardName(r)}
                    points={r.score}
                    streak={r.streakCount}
                    movement={0}
                    isCurrentUser={r.userId === user?.id}
                    avatarUrl={r.avatarUrl}
                    onPress={() => openProfile(r)}
                  />
                </View>
              ))}
            </Card>
          )}
        </>
      )}

      {tab === 'friends' && (
        <FriendsTab
          currentUserId={user?.id ?? null}
          firstName={firstName}
          onRequestsLoaded={setFriendRequestCount}
          onChallengeFriend={openChallenge}
          onOpenProfile={(s) =>
            setProfile({
              id: s.userId,
              name: s.userId === user?.id ? firstName : s.name,
              university: s.university,
              streak: s.streakCount,
              lp: s.score,
              avatarUrl: s.avatarUrl,
              isSelf: s.userId === user?.id,
            })
          }
        />
      )}

      {tab === 'team' && (
        <Card style={styles.teamCard}>
          <View style={[styles.iconTile, { backgroundColor: colors.track }]}>
            <AppIcon name="challenges" size={26} color={colors.textSecondary} />
          </View>
          <Text variant="section" color={colors.ink} center>
            Team leaderboard
          </Text>
          <Text variant="body" color={colors.textSecondary} center>
            Join a challenge to compete with your team. Per-team standings are coming soon.
          </Text>
        </Card>
      )}

      {/* How scoring works */}
      <Sheet visible={infoOpen} onClose={() => setInfoOpen(false)} title="How scoring works" showClose>
        <View style={styles.sheetBody}>
          <Text variant="body" color={colors.textSecondary}>
            Every confirmed meal earns 10 League Points (LP). Your rank is your total LP over the
            selected window — 2 weeks, 3 weeks, or 1 month. Keep logging daily to climb the board and
            protect your streak.
          </Text>
        </View>
      </Sheet>

      {/* Friend profile sheet */}
      <Sheet visible={!!profile} onClose={() => setProfile(null)} showClose>
        {profile && (
          <View style={styles.sheetBody}>
            <View style={styles.profileHead}>
              <Avatar name={profile.name} url={profile.avatarUrl} size={64} />
              <View style={{ flex: 1 }}>
                <Text variant="section" color={colors.ink} numberOfLines={1}>
                  {profile.name}
                </Text>
                {profile.university ? (
                  <View style={styles.uniRow}>
                    <AppIcon name="school" size={14} color={colors.textSecondary} />
                    <Text variant="label" color={colors.textSecondary} numberOfLines={1}>
                      {profile.university}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.profileStats}>
              {profile.streak > 0 ? <StreakPill count={profile.streak} size={16} /> : null}
              <View style={[styles.lpPill, { backgroundColor: colors.track }]}>
                <Text color={colors.ink} style={styles.lpPillValue} allowFontScaling={false}>
                  {profile.lp.toLocaleString()}
                </Text>
                <Text variant="labelSm" color={colors.textSecondary}>
                  LP
                </Text>
              </View>
            </View>
            {!profile.isSelf && (
              <Button
                label={`Challenge ${profile.name}`}
                icon="challenges"
                onPress={() => openChallenge(profile.id, profile.name)}
                style={{ marginTop: Spacing.base }}
              />
            )}
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

// ── Friends tab ─────────────────────────────────────────────────────
function FriendsTab({
  currentUserId,
  firstName,
  onChallengeFriend,
  onRequestsLoaded,
  onOpenProfile,
}: {
  currentUserId: string | null;
  firstName: string;
  onChallengeFriend: (friendId: string, friendName: string) => void;
  onRequestsLoaded?: (count: number) => void;
  onOpenProfile: (s: FriendStanding) => void;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const latestSearchId = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [standings, setStandings] = useState<FriendStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (shouldApply: () => boolean = () => true) => {
      if (shouldApply()) {
        setLoading(true);
        setError(null);
      }
      try {
        const [reqs, board] = await Promise.all([getFriendRequests(), getFriendsLeaderboard(14)]);
        if (!shouldApply()) return;
        setRequests(reqs);
        setStandings(board);
        onRequestsLoaded?.(reqs.length);
      } catch (e) {
        if (shouldApply()) {
          setError(e instanceof Error ? e.message : 'Could not load friends.');
        }
      } finally {
        if (shouldApply()) setLoading(false);
      }
    },
    [onRequestsLoaded],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void load(() => active);
      return () => {
        active = false;
      };
    }, [load]),
  );

  const runSearch = useCallback(async (text: string) => {
    const searchId = ++latestSearchId.current;
    if (text.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const found = await searchUsers(text);
      // Typing quickly can make an older, slower request finish last. Only the
      // newest request may replace the results for the text currently shown.
      if (searchId === latestSearchId.current) setResults(found);
    } catch {
      if (searchId === latestSearchId.current) setResults([]);
    } finally {
      if (searchId === latestSearchId.current) setSearching(false);
    }
  }, []);

  // Debounce keystrokes so we don't fire a request per character.
  const onChangeQuery = useCallback(
    (text: string) => {
      setQuery(text);
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => void runSearch(text), 220);
    },
    [runSearch],
  );

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
    <View>
      {/* Search */}
      <TextField
        value={query}
        onChangeText={onChangeQuery}
        placeholder="Search by name or username"
        rightIcon={query.length > 0 ? 'close' : 'search'}
        onRightIconPress={query.length > 0 ? () => onChangeQuery('') : undefined}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{ marginBottom: Spacing.base }}
      />

      {error && (
        <Text variant="label" color={colors.error} style={{ marginBottom: Spacing.sm }}>
          {error}
        </Text>
      )}

      {/* Incoming friend requests — kept above search results so an incoming
          request stays discoverable whether or not the user is searching. */}
      {!loading && requests.length > 0 && (
        <>
          <Text variant="overline" color={colors.textSecondary} style={styles.sectionLabel}>
            {`Friend Requests · ${requests.length}`}
          </Text>
          <Card padded={false} style={[styles.listCard, { overflow: 'hidden' }]}>
            {requests.map((req, i) => (
              <View key={req.userId}>
                {i > 0 && <Divider color={colors.rowDivider} />}
                <View style={styles.row}>
                  <Avatar name={req.name} url={req.avatarUrl} size={40} />
                  <View style={styles.rowMain}>
                    <Text variant="cardTitle" color={colors.ink} numberOfLines={1}>
                      {req.name}
                    </Text>
                    <Text variant="labelSm" color={colors.textSecondary} numberOfLines={1}>
                      {req.university ?? 'wants to be friends'}
                    </Text>
                  </View>
                  <View style={styles.actionsRow}>
                    <Button
                      label="Accept"
                      size="md"
                      fullWidth={false}
                      loading={busyId === req.userId}
                      loadingLabel="Accept"
                      onPress={() => onRespond(req.userId, true)}
                      style={styles.pillBtn}
                    />
                    <IconButton
                      icon="close"
                      size={40}
                      iconSize={18}
                      onPress={() => onRespond(req.userId, false)}
                      color={colors.textSecondary}
                      accessibilityLabel="Decline"
                    />
                  </View>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}

      {/* Search results */}
      {showingSearch ? (
        searching ? (
          <ActivityIndicator color={colors.scarlet} style={{ marginTop: Spacing.lg }} />
        ) : results.length === 0 ? (
          <Text variant="body" color={colors.textSecondary} center style={{ marginTop: Spacing.lg }}>
            No users found.
          </Text>
        ) : (
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {results.map((r, i) => (
              <View key={r.userId}>
                {i > 0 && <Divider color={colors.rowDivider} />}
                <View style={styles.row}>
                  <Avatar name={r.name} url={r.avatarUrl} size={40} />
                  <View style={styles.rowMain}>
                    <Text variant="cardTitle" color={colors.ink} numberOfLines={1}>
                      {r.name}
                    </Text>
                    {r.university ? (
                      <Text variant="labelSm" color={colors.textSecondary} numberOfLines={1}>
                        {r.university}
                      </Text>
                    ) : null}
                  </View>
                  <StatusButton
                    status={r.status}
                    busy={busyId === r.userId}
                    onAdd={() => onAdd(r)}
                    onAccept={() => onRespond(r.userId, true)}
                  />
                </View>
              </View>
            ))}
          </Card>
        )
      ) : loading ? (
        <ActivityIndicator color={colors.scarlet} style={{ marginTop: Spacing.lg }} />
      ) : (
        <>
          <Text
            variant="overline"
            color={colors.textSecondary}
            style={[styles.sectionLabel, { marginTop: requests.length ? Spacing.lg : 0 }]}
          >
            This Week
          </Text>
          {standings.length <= 1 ? (
            <FriendsEmpty />
          ) : (
            <Card padded={false} style={{ overflow: 'hidden' }}>
              {standings.map((s, i) => {
                const isMe = s.userId === currentUserId;
                return (
                  <View key={s.userId}>
                    {i > 0 && <Divider color={colors.rowDivider} />}
                    <View style={styles.standingRow}>
                      <View style={{ flex: 1 }}>
                        <LeaderboardRow
                          rank={s.rank}
                          name={isMe ? firstName : s.name}
                          points={s.score}
                          streak={s.streakCount}
                          movement={0}
                          isCurrentUser={isMe}
                          avatarUrl={s.avatarUrl}
                          onPress={() => onOpenProfile(s)}
                        />
                      </View>
                      {!isMe && (
                        <Button
                          label="Challenge"
                          icon="challenges"
                          size="md"
                          fullWidth={false}
                          variant="secondary"
                          onPress={() => onChallengeFriend(s.userId, s.name)}
                          style={[styles.pillBtn, { marginRight: Spacing.md }]}
                        />
                      )}
                    </View>
                  </View>
                );
              })}
            </Card>
          )}
        </>
      )}
    </View>
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
  const { colors } = useTheme();
  if (busy) return <ActivityIndicator color={colors.scarlet} style={{ width: 92 }} />;
  if (status === 'friends')
    return (
      <View style={[styles.statusPill, { backgroundColor: colors.successTint }]}>
        <AppIcon name="checkmark" size={14} color={colors.successDeep} />
        <Text variant="label" color={colors.successDeep}>
          Friends
        </Text>
      </View>
    );
  if (status === 'outgoing')
    return (
      <View style={[styles.statusPill, { backgroundColor: colors.track }]}>
        <Text variant="label" color={colors.textSecondary}>
          Requested
        </Text>
      </View>
    );
  if (status === 'incoming')
    return (
      <Button label="Accept" size="md" fullWidth={false} onPress={onAccept} style={styles.pillBtn} />
    );
  return (
    <Button
      label="Add"
      icon="plus"
      size="md"
      fullWidth={false}
      variant="secondary"
      onPress={onAdd}
      style={styles.pillBtn}
    />
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ComponentProps<typeof AppIcon>['name'];
  title: string;
  body: string;
}) {
  const { colors } = useTheme();
  return (
    <Card style={styles.teamCard}>
      <View style={[styles.iconTile, { backgroundColor: colors.track }]}>
        <AppIcon name={icon} size={26} color={colors.textSecondary} />
      </View>
      <Text variant="section" color={colors.ink} center>
        {title}
      </Text>
      <Text variant="body" color={colors.textSecondary} center>
        {body}
      </Text>
    </Card>
  );
}

function FriendsEmpty() {
  const { colors } = useTheme();
  const stack = ['Maya', 'Diego', 'Priya'];
  return (
    <Card style={styles.teamCard}>
      <View style={styles.avatarStack}>
        {stack.map((n, i) => (
          <View key={n} style={{ marginLeft: i === 0 ? 0 : -12 }}>
            <Avatar name={n} size={44} ring={colors.card} ringWidth={2} />
          </View>
        ))}
      </View>
      <Text variant="section" color={colors.ink} center>
        Build your league.
      </Text>
      <Text variant="body" color={colors.textSecondary} center>
        Add friends to compare progress and create challenges. Search by name or username above.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.base,
  },

  tabsRow: { flexDirection: 'row', gap: Spacing.xl, marginBottom: Spacing.base },
  tab: { alignItems: 'flex-start' },
  tabLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 6 },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: { fontFamily: FontFamily.semibold, fontSize: 11, lineHeight: 13 },
  tabUnderline: { height: 2.5, alignSelf: 'stretch', borderRadius: 2 },

  rankCard: {
    flexDirection: 'row',
    borderRadius: Radius.hero,
    padding: 18,
    marginBottom: Spacing.base,
  },
  rankCardLeft: { justifyContent: 'center', paddingRight: 18 },
  rankBig: { fontFamily: FontFamily.numBold, fontSize: 44, lineHeight: 46, marginTop: 2 },
  rankDivider: { width: 1, alignSelf: 'stretch' },
  rankCardRight: { flex: 1, paddingLeft: 18, gap: 8, justifyContent: 'center' },
  rankStatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lpInline: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  lpInlineValue: { fontFamily: FontFamily.numBold, fontSize: 20 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deltaValue: { fontFamily: FontFamily.numBold, fontSize: 15 },

  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xxl, gap: Spacing.sm },

  teamCard: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  iconTile: {
    width: 52,
    height: 52,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarStack: { flexDirection: 'row' },

  sectionLabel: { marginBottom: Spacing.sm },
  listCard: { marginBottom: Spacing.base },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  rowMain: { flex: 1 },
  standingRow: { flexDirection: 'row', alignItems: 'center' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  pillBtn: { height: 40, borderRadius: Radius.pill, paddingHorizontal: 16 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
  },

  sheetBody: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  profileHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base },
  uniRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  profileStats: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.base },
  lpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  lpPillValue: { fontFamily: FontFamily.numBold, fontSize: 16 },
});
