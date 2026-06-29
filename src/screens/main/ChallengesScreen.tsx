import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Colors, FontFamily } from '../../theme';
import { useUserStore } from '../../store/userStore';
import ChallengeCard from '../../components/ChallengeCard';
import AppIcon, { AppIconName } from '../../components/ui/AppIcon';
import RotatingTrophy from '../../components/animations/RotatingTrophy';
import {
  listChallenges,
  getChallengeDetail,
  createChallenge,
  joinChallenge,
  inviteToChallenge,
  respondChallengeInvite,
  getChallengeInvites,
  ChallengeSummary,
  ChallengeDetail as ChallengeDetailType,
  ChallengeInvite,
  ChallengeType,
  ChallengeGoalType,
} from '../../services/challengeService';
import { publicLeaderboardName } from '../../services/leaderboardService';
import { getFriends, Friend } from '../../services/friendService';

/** Friend passed from the Leaderboard "Challenge" button to pre-seed an invite. */
type InviteFriendParam = { id: string; name: string } | undefined;

export default function ChallengesScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [challenges, setChallenges] = useState<ChallengeSummary[]>([]);
  const [invites, setInvites] = useState<ChallengeInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  // Friend to invite once a challenge is created (from the Leaderboard button).
  const [pendingInvite, setPendingInvite] = useState<InviteFriendParam>(undefined);
  const [respondingInvite, setRespondingInvite] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [list, inv] = await Promise.all([listChallenges(), getChallengeInvites()]);
      setChallenges(list);
      setInvites(inv);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load challenges.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // A friend tapped "Challenge" on the Leaderboard → open Create pre-seeded.
  useFocusEffect(
    useCallback(() => {
      const friend = route.params?.inviteFriend as InviteFriendParam;
      if (friend) {
        setPendingInvite(friend);
        setShowCreate(true);
        navigation.setParams({ inviteFriend: undefined });
      }
    }, [route.params?.inviteFriend, navigation]),
  );

  async function respondToInvite(inviteId: string, accept: boolean) {
    setRespondingInvite(inviteId);
    try {
      await respondChallengeInvite(inviteId, accept);
      await load();
    } catch (e) {
      Alert.alert('Could not respond', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setRespondingInvite(null);
    }
  }

  if (selectedId) {
    return (
      <ChallengeDetail
        challengeId={selectedId}
        onBack={() => {
          setSelectedId(null);
          void load();
        }}
      />
    );
  }

  const active = challenges.filter((c) => c.status === 'active');
  const upcoming = challenges.filter((c) => c.status === 'upcoming');
  const completed = challenges.filter((c) => c.status === 'completed');

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>CHALLENGES</Text>

        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : challenges.length === 0 ? (
          <View style={styles.emptyBox}>
            <AppIcon name="challenges" size={40} />
            <Text style={styles.emptyTitle}>No challenges yet</Text>
            <Text style={styles.emptySub}>Create the first one and invite your friends to compete.</Text>
          </View>
        ) : (
          <>
            {invites.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>CHALLENGE INVITES</Text>
                {invites.map((inv) => (
                  <View key={inv.inviteId} style={styles.inviteCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inviteName}>{inv.challengeName}</Text>
                      <Text style={styles.inviteSub}>
                        from {inv.inviterName} · ends{' '}
                        {new Date(`${inv.endDate}T00:00:00`).toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={styles.inviteActions}>
                      <TouchableOpacity
                        style={[styles.inviteBtn, styles.inviteBtnPrimary]}
                        disabled={respondingInvite === inv.inviteId}
                        onPress={() => respondToInvite(inv.inviteId, true)}
                      >
                        <Text style={styles.inviteBtnPrimaryText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.inviteBtn}
                        disabled={respondingInvite === inv.inviteId}
                        onPress={() => respondToInvite(inv.inviteId, false)}
                      >
                        <Text style={styles.inviteBtnText}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {renderSection('ACTIVE', active, setSelectedId)}
            {renderSection('UPCOMING', upcoming, setSelectedId)}
            {renderSection('COMPLETED', completed, setSelectedId)}
          </>
        )}

        <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)}>
          <AppIcon name="plus" size={17} color={Colors.primary} />
          <Text style={styles.createBtnText}>CREATE CHALLENGE</Text>
        </TouchableOpacity>
      </ScrollView>

      <CreateChallengeModal
        visible={showCreate}
        inviteFriend={pendingInvite}
        onClose={() => {
          setShowCreate(false);
          setPendingInvite(undefined);
        }}
        onCreated={() => {
          setShowCreate(false);
          setPendingInvite(undefined);
          void load();
        }}
      />
    </View>
  );
}

function renderSection(
  title: string,
  items: ChallengeSummary[],
  onSelect: (id: string) => void,
) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.map((c) => (
        <ChallengeCard
          key={c.id}
          name={c.name}
          type={c.type}
          stakesText={c.stakesText}
          endDate={c.endDate}
          status={c.status}
          participantCount={c.participantCount}
          joined={c.joined}
          onPress={() => onSelect(c.id)}
        />
      ))}
    </View>
  );
}

// ── Create Challenge Modal ────────────────────────────────

const GOAL_OPTIONS: { key: ChallengeGoalType; label: string; icon: AppIconName | 'streak' }[] = [
  { key: 'protein', label: 'Protein', icon: 'protein' },
  { key: 'meal_count', label: 'Meals', icon: 'meal-goal' },
  { key: 'streak', label: 'Streak', icon: 'calendar' },
];

function CreateChallengeModal({
  visible,
  inviteFriend,
  onClose,
  onCreated,
}: {
  visible: boolean;
  inviteFriend?: InviteFriendParam;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ChallengeType>('team');
  const [goalType, setGoalType] = useState<ChallengeGoalType>('protein');
  const [duration, setDuration] = useState(7);
  const [stakes, setStakes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      Alert.alert('Error', 'Give your challenge a name');
      return;
    }
    setSaving(true);
    try {
      const challengeId = await createChallenge({
        name: name.trim(),
        type,
        goalType,
        durationDays: duration,
        stakes: stakes.trim(),
      });
      // If launched from a friend's "Challenge" button, invite them now.
      if (inviteFriend) {
        try {
          await inviteToChallenge(challengeId, inviteFriend.id);
        } catch (e) {
          Alert.alert(
            'Challenge created',
            `But we couldn't invite ${inviteFriend.name}: ${
              e instanceof Error ? e.message : 'please try from the challenge.'
            }`,
          );
          setName('');
          setStakes('');
          onCreated();
          return;
        }
      }
      setName('');
      setStakes('');
      onCreated();
      Alert.alert(
        'Created!',
        inviteFriend
          ? `Your challenge is live and ${inviteFriend.name} has been invited.`
          : 'Your challenge is live. Invite your friends!',
      );
    } catch (e) {
      Alert.alert('Could not create', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={createStyles.overlay}>
        <View style={createStyles.card}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={createStyles.title}>CREATE CHALLENGE</Text>
            {inviteFriend && (
              <View style={createStyles.invitingBanner}>
                <AppIcon name="users" size={14} color={Colors.primary} />
                <Text style={createStyles.invitingText}>Inviting {inviteFriend.name}</Text>
              </View>
            )}

            <Text style={createStyles.label}>Challenge Name</Text>
            <TextInput
              style={createStyles.input}
              placeholder="e.g. Protein Week"
              placeholderTextColor={Colors.textSecondary}
              value={name}
              onChangeText={setName}
            />

            <Text style={createStyles.label}>Type</Text>
            <View style={createStyles.optionRow}>
              {(['solo', 'team'] as ChallengeType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[createStyles.optionBtn, type === t && createStyles.optionBtnActive]}
                  onPress={() => setType(t)}
                >
                  <View style={createStyles.optionContent}>
                    <AppIcon
                      name={t === 'solo' ? 'solo' : 'challenges'}
                      size={15}
                      color={type === t ? Colors.primary : Colors.textSecondary}
                    />
                    <Text style={[createStyles.optionText, type === t && createStyles.optionTextActive]}>
                      {t === 'solo' ? 'Solo' : 'Team'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={createStyles.label}>Goal</Text>
            <View style={createStyles.optionRow}>
              {GOAL_OPTIONS.map((g) => (
                <TouchableOpacity
                  key={g.key}
                  style={[createStyles.optionBtn, goalType === g.key && createStyles.optionBtnActive]}
                  onPress={() => setGoalType(g.key)}
                >
                  <View style={createStyles.optionContent}>
                    <AppIcon
                      name={g.icon === 'streak' ? 'calendar' : g.icon}
                      size={15}
                      color={goalType === g.key ? Colors.primary : Colors.textSecondary}
                    />
                    <Text style={[createStyles.optionText, goalType === g.key && createStyles.optionTextActive]}>
                      {g.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={createStyles.label}>Duration</Text>
            <View style={createStyles.optionRow}>
              {[3, 7, 14].map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[createStyles.optionBtn, duration === d && createStyles.optionBtnActive]}
                  onPress={() => setDuration(d)}
                >
                  <Text style={[createStyles.optionText, duration === d && createStyles.optionTextActive]}>
                    {d} days
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={createStyles.label}>Stakes (optional)</Text>
            <TextInput
              style={createStyles.input}
              placeholder="e.g. Loser buys coffee"
              placeholderTextColor={Colors.textSecondary}
              value={stakes}
              onChangeText={setStakes}
            />

            <TouchableOpacity
              style={[createStyles.createBtn, saving && { opacity: 0.6 }]}
              onPress={handleCreate}
              disabled={saving}
            >
              <Text style={createStyles.createBtnText}>{saving ? 'CREATING…' : 'CREATE'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={createStyles.cancelBtn} disabled={saving}>
              <Text style={createStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  card: { backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  title: { fontFamily: FontFamily.displayBold, fontSize: 22, color: Colors.textPrimary, marginBottom: 20 },
  label: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: Colors.textSecondary, letterSpacing: 1, marginBottom: 8, marginTop: 12 },
  input: {
    backgroundColor: Colors.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  optionRow: { flexDirection: 'row', gap: 8 },
  optionBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionBtnActive: { backgroundColor: Colors.primary + '14', borderColor: Colors.primary + '44' },
  optionContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  optionText: { fontFamily: FontFamily.bodyMedium, fontSize: 13, color: Colors.textSecondary },
  optionTextActive: { color: Colors.primary },
  createBtn: { backgroundColor: Colors.primary, borderRadius: 50, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  createBtnText: { fontFamily: FontFamily.displayBold, fontSize: 16, color: Colors.background },
  cancelBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.textSecondary },
  invitingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary + '14',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  invitingText: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: Colors.primary },
});

// ── Challenge Detail ──────────────────────────────────────

function ChallengeDetail({ challengeId, onBack }: { challengeId: string; onBack: () => void }) {
  const userId = useUserStore((s) => s.user?.id);
  const [detail, setDetail] = useState<ChallengeDetailType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setDetail(await getChallengeDetail(challengeId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this challenge.');
    } finally {
      setIsLoading(false);
    }
  }, [challengeId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleJoin() {
    setJoining(true);
    try {
      await joinChallenge(challengeId, detail?.type === 'solo' ? 'Solo' : 'My Team');
      await load();
    } catch (e) {
      Alert.alert('Could not join', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setJoining(false);
    }
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingBox]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <AppIcon name="back" size={17} color={Colors.primary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error ?? 'Challenge not found.'}</Text>
        </View>
      </ScrollView>
    );
  }

  // Group standings by team for team challenges.
  const teams = new Map<string, { score: number; members: string[] }>();
  for (const s of detail.standings) {
    const entry = teams.get(s.teamName) ?? { score: 0, members: [] };
    entry.score += s.score;
    entry.members.push(publicLeaderboardName(s));
    teams.set(s.teamName, entry);
  }
  const teamEntries = Array.from(teams.entries());

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <AppIcon name="back" size={17} color={Colors.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.detailTitle}>{detail.name}</Text>
      <Text style={styles.detailMeta}>
        {detail.type === 'solo' ? 'Solo Challenge' : 'Team Challenge'} · {detail.status} · Ends{' '}
        {new Date(`${detail.endDate}T00:00:00`).toLocaleDateString()}
      </Text>

      {/* Standings — derived scores from the ledger */}
      <Text style={styles.sectionTitle}>STANDINGS</Text>
      {detail.standings.length === 0 ? (
        <Text style={styles.emptyText}>No participants yet.</Text>
      ) : detail.type === 'team' && teamEntries.length >= 2 ? (
        <View style={styles.scoreboard}>
          {teamEntries.slice(0, 2).map(([teamName, t], idx) => (
            <React.Fragment key={teamName}>
              {idx === 1 && (
                <View style={styles.vsBlock}>
                  <Text style={styles.vsText}>VS</Text>
                </View>
              )}
              <View style={[styles.teamBlock, idx === 1 && { alignItems: 'flex-end' }]}>
                <Text style={styles.teamNameLg}>{teamName}</Text>
                <Text style={[styles.teamScoreLg, { color: idx === 0 ? Colors.primary : Colors.accent }]}>
                  {t.score}
                </Text>
                {t.members.map((m, i) => (
                  <Text key={i} style={styles.memberName}>{m}</Text>
                ))}
              </View>
            </React.Fragment>
          ))}
        </View>
      ) : (
        <View style={styles.standingsList}>
          {detail.standings.map((s) => (
            <View
              key={s.userId}
              style={[styles.standingRow, s.userId === userId && styles.standingRowMe]}
            >
              <Text style={styles.standingRank}>{s.rank}</Text>
              <Text style={styles.standingName} numberOfLines={1}>
                {publicLeaderboardName(s)}
                {s.userId === userId ? ' (You)' : ''}
              </Text>
              <Text style={styles.standingScore}>{s.score} pts</Text>
            </View>
          ))}
        </View>
      )}

      {/* Goals — display targets (completion not auto-evaluated in Phase 1) */}
      {detail.goals.length > 0 && (
        <View style={styles.goalsSection}>
          <Text style={styles.sectionTitle}>GOALS</Text>
          {detail.goals.map((g) => (
            <View key={g.id} style={styles.goalRow}>
              <AppIcon name="target" size={17} color={Colors.primary} />
              <View style={styles.goalInfo}>
                <Text style={styles.goalName}>{g.description}</Text>
                <Text style={styles.goalPts}>+{g.pointsValue} pts</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Stakes */}
      <View style={styles.stakesCard}>
        <View style={styles.stakesTitleRow}>
          <RotatingTrophy size={16} />
          <Text style={styles.stakesLabel}>STAKES</Text>
        </View>
        <Text style={styles.stakesValue}>{detail.stakesText}</Text>
      </View>

      {detail.joined ? (
        <>
          <View style={styles.participatingBadge}>
            <AppIcon name="check" size={16} color={Colors.primary} />
            <Text style={styles.participatingText}>You're in this challenge</Text>
          </View>
          {detail.status !== 'completed' && (
            <TouchableOpacity style={styles.inviteFriendsBtn} onPress={() => setShowInvite(true)}>
              <AppIcon name="plus" size={16} color={Colors.primary} />
              <Text style={styles.inviteFriendsText}>INVITE FRIENDS</Text>
            </TouchableOpacity>
          )}
          <InviteFriendsModal
            visible={showInvite}
            challengeId={challengeId}
            existingParticipantIds={detail.standings.map((s) => s.userId)}
            onClose={() => setShowInvite(false)}
          />
        </>
      ) : detail.status !== 'completed' ? (
        <TouchableOpacity style={[styles.joinBtn, joining && { opacity: 0.6 }]} onPress={handleJoin} disabled={joining}>
          <Text style={styles.joinBtnText}>{joining ? 'JOINING…' : 'JOIN CHALLENGE'}</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.participatingBadge}>
          <Text style={styles.participatingText}>This challenge has ended</Text>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ── Invite Friends Modal ──────────────────────────────────

function InviteFriendsModal({
  visible,
  challengeId,
  existingParticipantIds,
  onClose,
}: {
  visible: boolean;
  challengeId: string;
  existingParticipantIds: string[];
  onClose: () => void;
}) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [invited, setInvited] = useState<Record<string, 'sending' | 'sent'>>({});

  useFocusEffect(
    useCallback(() => {
      if (!visible) return;
      let active = true;
      setLoading(true);
      (async () => {
        try {
          const all = await getFriends();
          if (active) setFriends(all);
        } catch {
          if (active) setFriends([]);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [visible]),
  );

  async function invite(friend: Friend) {
    setInvited((m) => ({ ...m, [friend.userId]: 'sending' }));
    try {
      await inviteToChallenge(challengeId, friend.userId);
      setInvited((m) => ({ ...m, [friend.userId]: 'sent' }));
    } catch (e) {
      setInvited((m) => {
        const next = { ...m };
        delete next[friend.userId];
        return next;
      });
      Alert.alert('Could not invite', e instanceof Error ? e.message : 'Please try again.');
    }
  }

  const eligible = friends.filter((f) => !existingParticipantIds.includes(f.userId));

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={createStyles.overlay}>
        <View style={createStyles.card}>
          <Text style={createStyles.title}>INVITE FRIENDS</Text>
          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: 24 }} />
          ) : eligible.length === 0 ? (
            <Text style={styles.emptyText}>
              {friends.length === 0
                ? 'Add friends first, then invite them here.'
                : 'All your friends are already in this challenge.'}
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {eligible.map((f) => {
                const state = invited[f.userId];
                return (
                  <View key={f.userId} style={styles.inviteCard}>
                    <Text style={[styles.inviteName, { flex: 1 }]}>{f.name}</Text>
                    <TouchableOpacity
                      style={[styles.inviteBtn, !state && styles.inviteBtnPrimary]}
                      disabled={!!state}
                      onPress={() => invite(f)}
                    >
                      <Text style={state ? styles.inviteBtnText : styles.inviteBtnPrimaryText}>
                        {state === 'sent' ? 'Invited' : state === 'sending' ? '…' : 'Invite'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}
          <TouchableOpacity onPress={onClose} style={createStyles.cancelBtn}>
            <Text style={createStyles.cancelText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingTop: 60 },
  title: { fontFamily: FontFamily.displayBold, fontSize: 24, color: Colors.textPrimary, letterSpacing: 1, marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { fontFamily: FontFamily.displayBold, fontSize: 13, color: Colors.textSecondary, letterSpacing: 1.5, marginBottom: 12 },
  loadingBox: { alignItems: 'center', justifyContent: 'center' },
  errorBanner: {
    backgroundColor: Colors.error + '16',
    borderColor: Colors.error + '55',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { fontFamily: FontFamily.bodyMedium, fontSize: 13, color: Colors.error },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 6 },
  emptyTitle: { fontFamily: FontFamily.displayBold, fontSize: 18, color: Colors.textPrimary },
  emptySub: { fontFamily: FontFamily.body, fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  createBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: 50,
    paddingVertical: 16,
    alignItems: 'center',
    borderStyle: 'dashed',
    marginTop: 4,
  },
  createBtnText: { fontFamily: FontFamily.displayBold, fontSize: 15, color: Colors.primary },
  // Detail
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backText: { fontFamily: FontFamily.bodyMedium, fontSize: 15, color: Colors.primary },
  detailTitle: { fontFamily: FontFamily.displayBold, fontSize: 28, color: Colors.textPrimary, marginBottom: 4 },
  detailMeta: { fontFamily: FontFamily.body, fontSize: 14, color: Colors.textSecondary, marginBottom: 24, textTransform: 'capitalize' },
  scoreboard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    marginBottom: 20,
  },
  teamBlock: { flex: 1 },
  vsBlock: { justifyContent: 'center', paddingHorizontal: 12 },
  vsText: { fontFamily: FontFamily.displayBold, fontSize: 18, color: Colors.textSecondary },
  teamNameLg: { fontFamily: FontFamily.displayBold, fontSize: 16, color: Colors.textPrimary, marginBottom: 4 },
  teamScoreLg: { fontFamily: FontFamily.displayBold, fontSize: 32, marginBottom: 8 },
  memberName: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  standingsList: { marginBottom: 20 },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  standingRowMe: { borderColor: Colors.primary + '66', backgroundColor: Colors.primary + '10' },
  standingRank: { fontFamily: FontFamily.displayBold, fontSize: 16, color: Colors.textSecondary, width: 24 },
  standingName: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.textPrimary, flex: 1 },
  standingScore: { fontFamily: FontFamily.displayBold, fontSize: 14, color: Colors.primary },
  goalsSection: { marginBottom: 20 },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  goalInfo: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  goalName: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.textPrimary, flex: 1, marginRight: 8 },
  goalPts: { fontFamily: FontFamily.displayBold, fontSize: 14, color: Colors.primary },
  emptyText: { fontFamily: FontFamily.body, fontSize: 14, color: Colors.textSecondary, paddingVertical: 12 },
  stakesCard: {
    backgroundColor: Colors.gold + '10',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gold + '33',
    padding: 16,
    marginBottom: 20,
  },
  stakesLabel: { fontFamily: FontFamily.displayBold, fontSize: 13, color: Colors.gold },
  stakesTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  stakesValue: { fontFamily: FontFamily.bodyMedium, fontSize: 15, color: Colors.textPrimary },
  joinBtn: { backgroundColor: Colors.primary, borderRadius: 50, paddingVertical: 16, alignItems: 'center' },
  joinBtnText: { fontFamily: FontFamily.displayBold, fontSize: 16, color: Colors.background },
  participatingBadge: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: Colors.primary + '12',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary + '22',
    paddingVertical: 14,
    alignItems: 'center',
  },
  participatingText: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.primary },

  // Invites
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 8,
  },
  inviteName: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, color: Colors.textPrimary },
  inviteSub: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  inviteActions: { flexDirection: 'row', gap: 6 },
  inviteBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  inviteBtnText: { fontFamily: FontFamily.bodyMedium, fontSize: 13, color: Colors.textSecondary },
  inviteBtnPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  inviteBtnPrimaryText: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: Colors.background },
  inviteFriendsBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    borderRadius: 50,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  inviteFriendsText: { fontFamily: FontFamily.displayBold, fontSize: 14, color: Colors.primary },
});
