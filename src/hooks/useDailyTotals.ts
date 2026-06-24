import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  DailyTotals,
  getMealsForDay,
  MealLog,
  sumMealTotals,
} from '../services/mealLogService';

export interface ProfileGoals {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  unsaturatedFatG: number | null;
  transFatG: number | null;
}

type ProfileRow = {
  timezone: string;
  goal_calories: number | null;
  goal_protein_g: number | null;
  goal_carbs_g: number | null;
  goal_unsaturated_fat_g: number | null;
  goal_trans_fat_g: number | null;
};

type ProfileState = {
  timezone: string;
  goals: ProfileGoals;
};

// An empty day. `sumMealTotals([])` produces the same shape (incl. zeroed fat
// subtype coverage); we keep a constant here for the loading/error fast paths.
const ZERO_TOTALS: DailyTotals = sumMealTotals([]);

// Supabase/PostgREST surface failures as plain objects ({ message, code,
// details, hint }) rather than Error instances, so we extract a meaningful
// message instead of collapsing everything into a generic string. We only ever
// read known fields — never dump the whole object — so secrets can't leak.
function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error.trim() || 'An unknown error occurred.');
  }
  if (error && typeof error === 'object') {
    const shaped = error as { message?: unknown; code?: unknown };
    const message = typeof shaped.message === 'string' ? shaped.message.trim() : '';
    const code = typeof shaped.code === 'string' ? shaped.code.trim() : '';
    if (message) {
      return new Error(code ? `${message} (${code})` : message);
    }
  }
  return new Error('An unknown error occurred.');
}

async function fetchProfile(): Promise<ProfileState> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw userError;
  }
  if (!userData.user) {
    throw new Error('No authenticated user found.');
  }

  // `maybeSingle` instead of `single`: a missing profile is a real, recoverable
  // state (e.g. an account created before the profile trigger existed), not a
  // query bug. `single` turns zero rows into an opaque 406/PGRST116; here we
  // surface a clear, actionable error instead of inventing empty goals.
  const { data, error } = await supabase
    .from('profiles')
    .select('timezone, goal_calories, goal_protein_g, goal_carbs_g, goal_unsaturated_fat_g, goal_trans_fat_g')
    .eq('id', userData.user.id)
    .maybeSingle<ProfileRow>();

  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error(
      'Your account profile is missing. Apply the profile repair migration or contact support.',
    );
  }

  return {
    timezone: data.timezone,
    goals: {
      calories: data.goal_calories,
      proteinG: data.goal_protein_g,
      carbsG: data.goal_carbs_g,
      unsaturatedFatG: data.goal_unsaturated_fat_g,
      transFatG: data.goal_trans_fat_g,
    },
  };
}

export function useDailyTotals(date: Date): {
  meals: MealLog[];
  totals: DailyTotals;
  goals: ProfileGoals | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => void;
} {
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [totals, setTotals] = useState<DailyTotals>(ZERO_TOTALS);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isMealsLoading, setIsMealsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const dateTime = date.getTime();
  const selectedDate = useMemo(() => new Date(dateTime), [dateTime]);

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadProfile(): Promise<void> {
      setIsProfileLoading(true);
      setError(null);

      try {
        const loadedProfile = await fetchProfile();
        if (active) {
          setProfile(loadedProfile);
        }
      } catch (caughtError) {
        if (active) {
          setMeals([]);
          setTotals(ZERO_TOTALS);
          setError(toError(caughtError));
        }
      } finally {
        if (active) {
          setIsProfileLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!profile) {
      return;
    }

    let active = true;
    const currentProfile = profile;

    async function loadMealsAndTotals(): Promise<void> {
      setIsMealsLoading(true);
      setError(null);

      try {
        // Fetch the day's rows once and derive totals in memory, rather than
        // querying meal_logs a second time just to recompute the same sum.
        const loadedMeals = await getMealsForDay(selectedDate, currentProfile.timezone);

        if (active) {
          setMeals(loadedMeals);
          setTotals(sumMealTotals(loadedMeals));
        }
      } catch (caughtError) {
        if (active) {
          setMeals([]);
          setTotals(ZERO_TOTALS);
          setError(toError(caughtError));
        }
      } finally {
        if (active) {
          setIsMealsLoading(false);
        }
      }
    }

    void loadMealsAndTotals();

    return () => {
      active = false;
    };
  }, [profile, refreshKey, selectedDate]);

  if (isProfileLoading || isMealsLoading) {
    return {
      meals: [],
      totals: ZERO_TOTALS,
      goals: profile?.goals ?? null,
      isLoading: true,
      error,
      refresh,
    };
  }

  if (error) {
    return {
      meals: [],
      totals: ZERO_TOTALS,
      goals: profile?.goals ?? null,
      isLoading: false,
      error,
      refresh,
    };
  }

  return {
    meals,
    totals,
    goals: profile?.goals ?? null,
    isLoading: false,
    error: null,
    refresh,
  };
}
