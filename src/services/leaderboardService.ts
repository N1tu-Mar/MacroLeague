import { supabase } from '../lib/supabase';

/**
 * Supported individual leaderboard windows (days). 14/21/28 = 2/3/4 weeks and 30
 * = 1 month, matching the gamification plan and gamification_rule_sets duration
 * options. The default is the 2-week window.
 */
export type LeaderboardWindow = 14 | 21 | 28 | 30;
export const LEADERBOARD_WINDOWS: { days: LeaderboardWindow; label: string }[] = [
  { days: 14, label: '2 Weeks' },
  { days: 21, label: '3 Weeks' },
  { days: 30, label: '1 Month' },
];

export interface LeaderboardUser {
  userId: string;
  username: string;
  displayName: string | null;
  university: string | null;
  avatarUrl: string | null;
  score: number;
  streakCount: number;
  /** 1-based rank within the returned, already-sorted window. */
  rank: number;
}

type LeaderboardRow = {
  user_id: string;
  username: string;
  display_name: string | null;
  university: string | null;
  avatar_url: string | null;
  score: number | string;
  streak_count: number | null;
};

/**
 * Ranks users by summed leaderboard score over the selected window. Backed by the
 * SECURITY DEFINER get_leaderboard() RPC (migration 0006), which aggregates across
 * users (per-row RLS would otherwise hide other users' events) and exposes only
 * display fields + the aggregate score. Rows already arrive sorted; we attach the
 * 1-based rank here so callers don't re-rank.
 */
export async function getLeaderboard(
  windowDays: LeaderboardWindow = 14,
): Promise<LeaderboardUser[]> {
  const { data, error } = await supabase.rpc('get_leaderboard', { p_window_days: windowDays });
  if (error) throw error;

  return ((data ?? []) as LeaderboardRow[]).map((row, index) => ({
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    university: row.university,
    avatarUrl: row.avatar_url,
    score: Number(row.score),
    streakCount: row.streak_count ?? 0,
    rank: index + 1,
  }));
}
