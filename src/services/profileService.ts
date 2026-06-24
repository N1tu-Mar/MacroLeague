import { supabase } from '../lib/supabase';

// Shown when a read/update targets a user that has no profiles row. After the
// 0004 repair migration this should be unreachable; it stays as a clear,
// actionable safeguard instead of silently succeeding or inventing data.
const MISSING_PROFILE_MESSAGE =
  'Your account profile is missing. Apply the profile repair migration or contact support.';

export interface OnboardingProfileUpdate {
  username: string;
  goalCalories: number;
  goalProteinG: number;
  goalCarbsG: number;
  goalUnsaturatedFatG: number;
}

/**
 * Saves onboarding data into the profile row created by the auth trigger.
 * If the chosen username is already taken, falls back to keeping the
 * auto-generated one and still saves the macro goals.
 */
export async function updateOnboardingProfile(
  userId: string,
  update: OnboardingProfileUpdate,
): Promise<void> {
  const payload = {
    username: update.username,
    goal_calories: update.goalCalories,
    goal_protein_g: update.goalProteinG,
    goal_carbs_g: update.goalCarbsG,
    goal_unsaturated_fat_g: update.goalUnsaturatedFatG,
    goal_trans_fat_g: 0,
  };

  // `.select('id').maybeSingle()` so a write that matches zero rows (missing
  // profile) is detected: update().eq() succeeds with no error even when it
  // changes nothing, which would otherwise report a false "saved".
  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select('id')
    .maybeSingle();

  if (error) {
    // 23505 = unique_violation — username taken; retry without overwriting it
    if (error.code === '23505') {
      const { username: _omit, ...macrosOnly } = payload;
      const { data: retryData, error: retryError } = await supabase
        .from('profiles')
        .update(macrosOnly)
        .eq('id', userId)
        .select('id')
        .maybeSingle();
      if (retryError) throw retryError;
      if (!retryData) throw new Error(MISSING_PROFILE_MESSAGE);
      return;
    }
    throw error;
  }

  if (!data) throw new Error(MISSING_PROFILE_MESSAGE);
}

export interface ProfileGoalsUpdate {
  goalCalories: number;
  goalProteinG: number;
  goalCarbsG: number;
  /** Maps to profiles.goal_unsaturated_fat_g. Trans-fat goal is always 0. */
  goalUnsaturatedFatG: number;
}

/**
 * Loads the current macro goals for a user from their profile row. Any
 * individual unset goal comes back as 0. Throws a clear missing-profile error
 * when no profile row exists, rather than masquerading a missing profile as a
 * profile with empty goals. RLS ("read own profile") ensures a user can only
 * read their own goals.
 */
export async function getProfileGoals(userId: string): Promise<ProfileGoalsUpdate> {
  // `maybeSingle` so zero rows is a clean null instead of an opaque 406/PGRST116.
  const { data, error } = await supabase
    .from('profiles')
    .select('goal_calories, goal_protein_g, goal_carbs_g, goal_unsaturated_fat_g')
    .eq('id', userId)
    .maybeSingle<{
      goal_calories: number | null;
      goal_protein_g: number | null;
      goal_carbs_g: number | null;
      goal_unsaturated_fat_g: number | null;
    }>();

  if (error) throw error;
  if (!data) throw new Error(MISSING_PROFILE_MESSAGE);

  return {
    goalCalories: data.goal_calories ?? 0,
    goalProteinG: data.goal_protein_g ?? 0,
    goalCarbsG: data.goal_carbs_g ?? 0,
    goalUnsaturatedFatG: data.goal_unsaturated_fat_g ?? 0,
  };
}

/**
 * Persists macro goals to the user's profile. `goal_trans_fat_g` is always 0 to
 * satisfy the profiles_goal_trans_fat_zero constraint. The DB also enforces
 * calories > 1400, protein >= 50, carbs 25-65% of energy (migration 0002), and
 * unsaturated fat >= 10% of energy — callers should validate first for a clean
 * message, but the database is the final authority. RLS ("update own profile")
 * blocks writing another user's goals.
 */
export async function updateProfileGoals(
  userId: string,
  goals: ProfileGoalsUpdate,
): Promise<void> {
  // `.select('id').maybeSingle()` so an update matching zero rows (missing
  // profile) is reported as an error rather than a silent no-op success.
  const { data, error } = await supabase
    .from('profiles')
    .update({
      goal_calories: goals.goalCalories,
      goal_protein_g: goals.goalProteinG,
      goal_carbs_g: goals.goalCarbsG,
      goal_unsaturated_fat_g: goals.goalUnsaturatedFatG,
      goal_trans_fat_g: 0,
    })
    .eq('id', userId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(MISSING_PROFILE_MESSAGE);
}

/**
 * Backend-owned gamification snapshot for a user. Every field here is written
 * ONLY by the database (migration 0005's meal-award trigger / future RPCs); the
 * client can read these columns but column-level privileges forbid it from
 * writing xp/points/streaks. `level` is the one derived value (not a column).
 */
export interface ProfileStats {
  xp: number;
  points: number;
  streakCount: number;
  longestStreak: number;
  totalMealsLogged: number;
  challengesWon: number;
  /** Derived from xp; see xpForLevel(). Not stored, so it never drifts. */
  level: number;
}

// XP per level. Mirrors lib/leveling.getXpForLevel so the level shown on Home,
// Profile, and the XP bar all agree. Kept here so the gamification read is the
// single source of the level number once stats are backend-owned.
const XP_PER_LEVEL = 500;

/** Level from total XP. Level 1 is 0-499 XP, level 2 is 500-999, etc. */
export function levelFromXp(xp: number): number {
  return Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
}

/**
 * Loads the authenticated user's gamification counters from their profile row.
 * RLS ("read own profile") ensures a user only reads their own stats. Throws the
 * clear missing-profile error rather than inventing zeros when no row exists, so
 * a real backend problem is never silently masked as a fresh-looking account.
 */
export async function getProfileStats(userId: string): Promise<ProfileStats> {
  const { data, error } = await supabase
    .from('profiles')
    .select('xp, points, streak_count, longest_streak, total_meals_logged, challenges_won')
    .eq('id', userId)
    .maybeSingle<{
      xp: number | null;
      points: number | null;
      streak_count: number | null;
      longest_streak: number | null;
      total_meals_logged: number | null;
      challenges_won: number | null;
    }>();

  if (error) throw error;
  if (!data) throw new Error(MISSING_PROFILE_MESSAGE);

  const xp = data.xp ?? 0;
  return {
    xp,
    points: data.points ?? 0,
    streakCount: data.streak_count ?? 0,
    longestStreak: data.longest_streak ?? 0,
    totalMealsLogged: data.total_meals_logged ?? 0,
    challengesWon: data.challenges_won ?? 0,
    level: levelFromXp(xp),
  };
}

export interface ProfileIdentity {
  username: string;
  displayName: string | null;
  university: string | null;
  goalType: string | null;
}

/**
 * Loads the user-editable identity/display fields (added in migration 0006) so the
 * app can show the real saved name/university/goal instead of placeholders derived
 * from the auth email. RLS ("read own profile") restricts this to the caller.
 */
export async function getProfileIdentity(userId: string): Promise<ProfileIdentity> {
  const { data, error } = await supabase
    .from('profiles')
    .select('username, display_name, university, goal_type')
    .eq('id', userId)
    .maybeSingle<{
      username: string | null;
      display_name: string | null;
      university: string | null;
      goal_type: string | null;
    }>();

  if (error) throw error;
  if (!data) throw new Error(MISSING_PROFILE_MESSAGE);

  return {
    username: data.username ?? 'user',
    displayName: data.display_name,
    university: data.university,
    goalType: data.goal_type,
  };
}

/** Converts a display name into a valid username slug (3-30 chars). */
export function slugifyUsername(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const padded = slug.length >= 3 ? slug : slug.padEnd(3, '0');
  return padded.slice(0, 30);
}
