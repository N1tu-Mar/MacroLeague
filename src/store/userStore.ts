import { create } from 'zustand';
import { UserProfile, DailyGoals } from '../types';
import { supabase } from '../lib/supabase';
import {
  getProfileStats,
  getProfileIdentity,
  getProfileGoals,
  ProfileStats,
} from '../services/profileService';
import { getAccountStatus } from '../services/accountService';

// Until the real profile is hydrated, goals are zero (no goal set) rather than
// inventing demo targets. refreshStats() fills these from the profiles row.
const EMPTY_GOALS: DailyGoals = { calories: 0, protein: 0, carbs: 0, fats: 0 };

// Auth hydration and screen-focus hydration can overlap during signup. Only the
// newest request may update the store, so a slower response containing the
// trigger's temporary user_<id> name cannot overwrite the completed onboarding.
let latestProfileRefresh = 0;

const GOAL_TYPES: UserProfile['goalType'][] = ['muscle', 'lose_weight', 'eat_cleaner', 'just_track'];
function coerceGoalType(value: string | null): UserProfile['goalType'] {
  return (GOAL_TYPES as string[]).includes(value ?? '') ? (value as UserProfile['goalType']) : 'just_track';
}

interface UserState {
  user: UserProfile | null;
  dailyGoals: DailyGoals;
  isAuthenticated: boolean;
  /**
   * True while the signed-in account is archived (deletion requested, not yet
   * purged). App.tsx shows the reactivation gate instead of the main app when set.
   */
  isDeactivated: boolean;
  /** ISO time the archived account is scheduled for permanent deletion, or null. */
  deletionScheduledAt: string | null;
  /**
   * True when the signed-in user has not yet completed the goal/macro onboarding
   * step (goal_calories === 0 in their profile). App.tsx routes them to the
   * onboarding screen instead of the main app until this is false.
   */
  needsOnboarding: boolean;
  login: (user: UserProfile) => void;
  logout: () => void;
  /** Set/clear the local deletion state (after a deactivate/reactivate call). */
  setAccountLifecycle: (deactivated: boolean, scheduledAt: string | null) => void;
  /** Fetch the signed-in account's deletion state and cache it. */
  refreshAccountStatus: () => Promise<void>;
  /**
   * Merge a backend gamification snapshot into the cached user. This is the ONLY
   * way XP/points/streaks change on the client now — the values come from the
   * database (migration 0005's award trigger), never from local guesses.
   */
  applyStats: (stats: ProfileStats) => void;
  /**
   * Fetch the latest backend gamification stats for the signed-in user and cache
   * them. Safe to call after a meal log and on screen focus. Tolerates the
   * pre-0005 schema (missing columns) by leaving the current cache untouched.
   */
  refreshStats: () => Promise<void>;
  /**
   * LOCAL-ONLY, optimistic points adjustment used by the still-mocked Rewards
   * redemption (Prompt 6). NOT an earning authority and NOT persisted — the
   * backend remains the source of truth and a refreshStats() will overwrite it.
   */
  adjustPointsLocally: (delta: number) => void;
  setDailyGoals: (goals: DailyGoals) => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  dailyGoals: EMPTY_GOALS,
  isAuthenticated: false,
  isDeactivated: false,
  deletionScheduledAt: null,
  needsOnboarding: false,
  // login now requires a real, fully-formed profile object. The demo fallback was
  // removed so the app can never present an authenticated session backed by fake
  // data — App.tsx builds this from the Supabase session + real profile stats.
  login: (user: UserProfile) => set({ user, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false, isDeactivated: false, deletionScheduledAt: null, needsOnboarding: false }),
  setAccountLifecycle: (deactivated: boolean, scheduledAt: string | null) =>
    set({ isDeactivated: deactivated, deletionScheduledAt: scheduledAt }),
  refreshAccountStatus: async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return;
      const status = await getAccountStatus(data.user.id);
      set({ isDeactivated: status.deactivated, deletionScheduledAt: status.deletionScheduledAt });
    } catch (caughtError) {
      // If the 0009 columns aren't deployed yet, treat the account as active rather
      // than locking the user out of the app.
      console.warn('[userStore] refreshAccountStatus failed', caughtError);
    }
  },
  applyStats: (stats: ProfileStats) =>
    set((state) => {
      if (!state.user) return state;
      return {
        user: {
          ...state.user,
          xp: stats.xp,
          level: stats.level,
          points: stats.points,
          streakCount: stats.streakCount,
          longestStreak: stats.longestStreak,
          totalMealsLogged: stats.totalMealsLogged,
          challengesWon: stats.challengesWon,
        },
      };
    }),
  refreshStats: async () => {
    if (!get().user) return;
    const refreshId = ++latestProfileRefresh;
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return;
      const userId = data.user.id;

      // Pull the backend-owned stats, the real identity/display fields, and the
      // persisted macro goals together, so the whole cached profile reflects the
      // database (not the auth-email placeholders App.tsx seeds at login).
      const [stats, identity, goals] = await Promise.all([
        getProfileStats(userId),
        getProfileIdentity(userId),
        getProfileGoals(userId),
      ]);

      if (refreshId !== latestProfileRefresh || get().user?.id !== userId) return;

      get().applyStats(stats);
      set((state) =>
        state.user
          ? {
              user: {
                ...state.user,
                name: identity.displayName ?? identity.username,
                username: identity.username,
                university: identity.university ?? state.user.university,
                goalType: coerceGoalType(identity.goalType),
              },
            }
          : state,
      );
      set({
        dailyGoals: {
          calories: goals.goalCalories,
          protein: goals.goalProteinG,
          carbs: goals.goalCarbsG,
          fats: goals.goalUnsaturatedFatG,
        },
        // Force onboarding until BOTH are true: goals are set (goal_calories > 0)
        // and the user saved a real display name. A nameless account must never
        // reach the app or appear on the leaderboard as a placeholder.
        needsOnboarding: goals.goalCalories === 0 || !identity.hasName,
      });
    } catch (caughtError) {
      // Don't crash the UI if a migration isn't deployed yet (columns missing):
      // keep the existing cache and log quietly.
      console.warn('[userStore] refreshStats failed', caughtError);
    }
  },
  adjustPointsLocally: (delta: number) =>
    set((state) => {
      if (!state.user) return state;
      return { user: { ...state.user, points: Math.max(0, state.user.points + delta) } };
    }),
  setDailyGoals: (goals: DailyGoals) => set({ dailyGoals: goals }),
}));
