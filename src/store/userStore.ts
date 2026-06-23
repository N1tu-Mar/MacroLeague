import { create } from 'zustand';
import { UserProfile, DailyGoals } from '../types';
import { DEMO_DAILY_GOALS } from '../data/mockData';
import { supabase } from '../lib/supabase';
import { getProfileStats, ProfileStats } from '../services/profileService';

interface UserState {
  user: UserProfile | null;
  dailyGoals: DailyGoals;
  isAuthenticated: boolean;
  login: (user: UserProfile) => void;
  logout: () => void;
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
  dailyGoals: DEMO_DAILY_GOALS,
  isAuthenticated: false,
  // login now requires a real, fully-formed profile object. The demo fallback was
  // removed so the app can never present an authenticated session backed by fake
  // data — App.tsx builds this from the Supabase session + real profile stats.
  login: (user: UserProfile) => set({ user, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false }),
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
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return;
      const stats = await getProfileStats(data.user.id);
      get().applyStats(stats);
    } catch (caughtError) {
      // Don't crash the UI if the 0005 migration isn't deployed yet (the stats
      // columns won't exist remotely): keep the existing cache and log quietly.
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
