import { supabase } from '../lib/supabase';
import type { AppIconName } from '../components/ui/AppIcon';
import { describeOwnEvent, minutesSince } from '../lib/activityCopy';

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
  icon: AppIconName | 'streak';
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
    const { icon, text } = describeOwnEvent(row);
    return {
      id: row.id,
      icon,
      text,
      occurredAt: row.occurred_at,
      minutesAgo: minutesSince(row.occurred_at, now),
    };
  });
}
