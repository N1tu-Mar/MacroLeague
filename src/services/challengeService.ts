import { supabase } from '../lib/supabase';

/**
 * Supabase-backed challenge system (migration 0007). Scores are DERIVED by the
 * database (get_challenge_standings sums the trusted gamification_events ledger
 * over the challenge window); the client never sends a score. Status is derived
 * from dates here so it can never go stale.
 */

export type ChallengeType = 'solo' | 'team';
export type ChallengeGoalType = 'points' | 'protein' | 'meal_count' | 'streak';
export type ChallengeStatus = 'upcoming' | 'active' | 'completed';

export interface ChallengeSummary {
  id: string;
  name: string;
  type: ChallengeType;
  goalType: ChallengeGoalType;
  stakesText: string;
  durationDays: number;
  startDate: string;
  endDate: string;
  createdBy: string;
  status: ChallengeStatus;
  participantCount: number;
  /** Whether the signed-in user is enrolled. */
  joined: boolean;
}

export interface ChallengeStanding {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  teamName: string;
  streakCount: number;
  score: number;
  rank: number;
}

export interface ChallengeGoal {
  id: string;
  goalType: string;
  description: string;
  targetValue: number;
  pointsValue: number;
}

export interface ChallengeDetail extends ChallengeSummary {
  standings: ChallengeStanding[];
  goals: ChallengeGoal[];
}

type ChallengeRow = {
  id: string;
  created_by: string;
  name: string;
  type: ChallengeType;
  goal_type: ChallengeGoalType;
  stakes_text: string;
  duration_days: number;
  start_date: string;
  end_date: string;
};

/** Derives upcoming/active/completed from the challenge's date window (local today). */
export function deriveStatus(startDate: string, endDate: string): ChallengeStatus {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (todayStr < startDate) return 'upcoming';
  if (todayStr > endDate) return 'completed';
  return 'active';
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Lists all discoverable challenges with participant counts and whether the
 * signed-in user has joined. Reads are RLS-open for challenges/participants;
 * we aggregate counts client-side from the participant rows.
 */
export async function listChallenges(): Promise<ChallengeSummary[]> {
  const userId = await currentUserId();

  const [{ data: challenges, error: cErr }, { data: parts, error: pErr }] = await Promise.all([
    supabase
      .from('challenges')
      .select('id, created_by, name, type, goal_type, stakes_text, duration_days, start_date, end_date')
      .order('start_date', { ascending: false }),
    supabase.from('challenge_participants').select('challenge_id, user_id'),
  ]);

  if (cErr) throw cErr;
  if (pErr) throw pErr;

  const partRows = (parts ?? []) as { challenge_id: string; user_id: string }[];
  const counts = new Map<string, number>();
  const mine = new Set<string>();
  for (const row of partRows) {
    counts.set(row.challenge_id, (counts.get(row.challenge_id) ?? 0) + 1);
    if (userId && row.user_id === userId) mine.add(row.challenge_id);
  }

  return ((challenges ?? []) as ChallengeRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    goalType: c.goal_type,
    stakesText: c.stakes_text,
    durationDays: c.duration_days,
    startDate: c.start_date,
    endDate: c.end_date,
    createdBy: c.created_by,
    status: deriveStatus(c.start_date, c.end_date),
    participantCount: counts.get(c.id) ?? 0,
    joined: mine.has(c.id),
  }));
}

/** Loads one challenge with its derived standings (ranked) and stacked goals. */
export async function getChallengeDetail(challengeId: string): Promise<ChallengeDetail> {
  const userId = await currentUserId();

  const [{ data: c, error: cErr }, standingsRes, { data: goals, error: gErr }] = await Promise.all([
    supabase
      .from('challenges')
      .select('id, created_by, name, type, goal_type, stakes_text, duration_days, start_date, end_date')
      .eq('id', challengeId)
      .maybeSingle<ChallengeRow>(),
    supabase.rpc('get_challenge_standings', { p_challenge_id: challengeId }),
    supabase
      .from('challenge_goals')
      .select('id, goal_type, description, target_value, points_value')
      .eq('challenge_id', challengeId)
      .order('created_at', { ascending: true }),
  ]);

  if (cErr) throw cErr;
  if (!c) throw new Error('Challenge not found.');
  if (standingsRes.error) throw standingsRes.error;
  if (gErr) throw gErr;

  type StandingRow = {
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    team_name: string;
    streak_count: number | null;
    score: number | string;
  };

  const standings: ChallengeStanding[] = ((standingsRes.data ?? []) as StandingRow[]).map((row, i) => ({
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    teamName: row.team_name,
    streakCount: row.streak_count ?? 0,
    score: Number(row.score),
    rank: i + 1,
  }));

  type GoalRow = {
    id: string;
    goal_type: string;
    description: string;
    target_value: number | string;
    points_value: number;
  };

  return {
    id: c.id,
    name: c.name,
    type: c.type,
    goalType: c.goal_type,
    stakesText: c.stakes_text,
    durationDays: c.duration_days,
    startDate: c.start_date,
    endDate: c.end_date,
    createdBy: c.created_by,
    status: deriveStatus(c.start_date, c.end_date),
    participantCount: standings.length,
    joined: Boolean(userId && standings.some((s) => s.userId === userId)),
    standings,
    goals: ((goals ?? []) as GoalRow[]).map((g) => ({
      id: g.id,
      goalType: g.goal_type,
      description: g.description,
      targetValue: Number(g.target_value),
      pointsValue: g.points_value,
    })),
  };
}

export interface CreateChallengeInput {
  name: string;
  type: ChallengeType;
  goalType: ChallengeGoalType;
  durationDays: number;
  stakes: string;
}

/** Creates a challenge (and enrolls the creator) via the atomic create_challenge RPC. */
export async function createChallenge(input: CreateChallengeInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_challenge', {
    p_name: input.name,
    p_type: input.type,
    p_goal_type: input.goalType,
    p_duration_days: input.durationDays,
    p_stakes: input.stakes,
  });
  if (error) throw error;
  return data as string;
}

/** Enrolls the signed-in user. The unique index makes a repeat join a clean error. */
export async function joinChallenge(challengeId: string, teamName = 'My Team'): Promise<void> {
  const userId = await currentUserId();
  if (!userId) throw new Error('You are not signed in.');
  const { error } = await supabase
    .from('challenge_participants')
    .insert({ challenge_id: challengeId, user_id: userId, team_name: teamName });
  if (error) {
    if (error.code === '23505') throw new Error('You have already joined this challenge.');
    throw error;
  }
}
