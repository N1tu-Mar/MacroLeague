import { supabase } from '../lib/supabase';
import { getProfileStats, ProfileStats } from './profileService';

/**
 * Base award for one confirmed meal log, used ONLY for optimistic post-log UI
 * (the floating "+XP" and the toast). These MUST mirror migration 0005's
 * award_meal_gamification() trigger constants (c_base_meal_xp / c_base_meal_points).
 * The database stays the single source of truth — after showing this optimistic
 * value the client always re-reads the real totals via refreshStats().
 */
export const BASE_MEAL_XP = 50;
export const BASE_MEAL_POINTS = 10;

/**
 * Reads the signed-in user's backend-owned gamification snapshot (XP, points,
 * streaks, counters + derived level). Returns null when there is no authenticated
 * user rather than throwing, so callers can treat "signed out" as a no-op.
 */
export async function fetchGamificationProfile(): Promise<ProfileStats | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return getProfileStats(data.user.id);
}
