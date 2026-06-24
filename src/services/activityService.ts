import { supabase } from '../lib/supabase';

/**
 * Reads the signed-in user's OWN real activity (RLS restricts to own rows) for the
 * Home recent-activity feed and the Profile weekly chart. Replaces the former
 * mock league activity / demo weekly arrays with persisted Supabase data.
 */

export interface DailyActivityPoint {
  /** Local activity_date (YYYY-MM-DD). */
  date: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealCount: number;
}

type DailyActivityRow = {
  activity_date: string;
  calories: number | string;
  protein_g: number | string;
  carbs_g: number | string;
  fat_g: number | string;
  meal_count: number;
};

/**
 * The user's last `days` of daily activity (most recent first as stored), keyed by
 * activity_date. Days with no logging simply have no row; callers fill gaps.
 */
export async function getRecentDailyActivity(days = 7): Promise<DailyActivityPoint[]> {
  const { data, error } = await supabase
    .from('user_daily_activity')
    .select('activity_date, calories, protein_g, carbs_g, fat_g, meal_count')
    .order('activity_date', { ascending: false })
    .limit(days);

  if (error) throw error;

  return ((data ?? []) as DailyActivityRow[]).map((row) => ({
    date: row.activity_date,
    calories: Number(row.calories),
    proteinG: Number(row.protein_g),
    carbsG: Number(row.carbs_g),
    fatG: Number(row.fat_g),
    mealCount: row.meal_count,
  }));
}

export interface ActivityFeedEntry {
  id: string;
  icon: string;
  text: string;
  occurredAt: string;
  /** Whole minutes since the event, for relative display. */
  minutesAgo: number;
}

type EventRow = {
  id: string;
  event_type: string;
  points_delta: number;
  occurred_at: string;
  metadata: Record<string, any> | null;
};

function describeEvent(row: EventRow): { icon: string; text: string } {
  const m = row.metadata ?? {};
  switch (row.event_type) {
    case 'meal_logged':
      return { icon: '🍽️', text: `Logged a meal · +${row.points_delta} pts` };
    case 'meal_count_goal_hit':
      return { icon: '🍱', text: `Hit your meal-count goal · +${row.points_delta} pts` };
    case 'daily_protein_goal_hit':
      return { icon: '💪', text: `Locked your protein goal · +${row.points_delta} pts` };
    case 'daily_macro_accuracy_hit':
      return { icon: '🎯', text: `Nailed your macro accuracy · +${row.points_delta} pts` };
    case 'streak_milestone':
      return { icon: '🔥', text: `Reached a ${m.streak ?? ''}-day streak · +${row.points_delta} pts` };
    case 'streak_bonus':
      return { icon: '🔥', text: `Streak bonus · +${row.points_delta} pts` };
    case 'challenge_win':
      return { icon: '🏆', text: `Won a challenge · +${row.points_delta} pts` };
    case 'reward_redemption':
      return { icon: '🎁', text: `Redeemed a reward · ${row.points_delta} pts` };
    default:
      return { icon: '⭐', text: `Earned ${row.points_delta} pts` };
  }
}

/** The user's most recent gamification events, formatted for the activity feed. */
export async function getRecentActivityFeed(limit = 6): Promise<ActivityFeedEntry[]> {
  const { data, error } = await supabase
    .from('gamification_events')
    .select('id, event_type, points_delta, occurred_at, metadata')
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const now = Date.now();
  return ((data ?? []) as EventRow[]).map((row) => {
    const { icon, text } = describeEvent(row);
    return {
      id: row.id,
      icon,
      text,
      occurredAt: row.occurred_at,
      minutesAgo: Math.max(0, Math.floor((now - new Date(row.occurred_at).getTime()) / 60000)),
    };
  });
}
