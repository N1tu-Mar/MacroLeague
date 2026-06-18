import { supabase } from '../lib/supabase';

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

  const { error } = await supabase.from('profiles').update(payload).eq('id', userId);

  if (error) {
    // 23505 = unique_violation — username taken; retry without overwriting it
    if (error.code === '23505') {
      const { username: _omit, ...macrosOnly } = payload;
      const { error: retryError } = await supabase
        .from('profiles')
        .update(macrosOnly)
        .eq('id', userId);
      if (retryError) throw retryError;
    } else {
      throw error;
    }
  }
}

export interface ProfileGoalsUpdate {
  goalCalories: number;
  goalProteinG: number;
  goalCarbsG: number;
  goalUnsaturatedFatG: number;
}

/**
 * Loads the current macro goals for a user from their profile row. Returns
 * null for any goal that has not been set yet.
 */
export async function getProfileGoals(userId: string): Promise<ProfileGoalsUpdate | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('goal_calories, goal_protein_g, goal_carbs_g, goal_unsaturated_fat_g')
    .eq('id', userId)
    .single<{
      goal_calories: number | null;
      goal_protein_g: number | null;
      goal_carbs_g: number | null;
      goal_unsaturated_fat_g: number | null;
    }>();

  if (error) throw error;
  if (!data) return null;

  return {
    goalCalories: data.goal_calories ?? 0,
    goalProteinG: data.goal_protein_g ?? 0,
    goalCarbsG: data.goal_carbs_g ?? 0,
    goalUnsaturatedFatG: data.goal_unsaturated_fat_g ?? 0,
  };
}

/**
 * Persists macro goals to the user's profile. `goal_trans_fat_g` is always 0
 * to satisfy the profiles_goal_trans_fat_zero constraint.
 */
export async function updateProfileGoals(
  userId: string,
  goals: ProfileGoalsUpdate,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      goal_calories: goals.goalCalories,
      goal_protein_g: goals.goalProteinG,
      goal_carbs_g: goals.goalCarbsG,
      goal_unsaturated_fat_g: goals.goalUnsaturatedFatG,
      goal_trans_fat_g: 0,
    })
    .eq('id', userId);

  if (error) throw error;
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
