import { ProfileStats } from '../services/profileService';

// Achievements DERIVED from the user's real backend-owned stats. Replaces the
// former MOCK_ACHIEVEMENTS list, so an unlocked badge always reflects something the
// database actually recorded (streaks, meals logged, level, challenge wins).

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

export function deriveAchievements(stats: ProfileStats): Achievement[] {
  return [
    {
      id: 'first_log',
      name: 'First Log',
      description: 'Log your first meal',
      icon: '🍽️',
      unlocked: stats.totalMealsLogged >= 1,
    },
    {
      id: 'streak_7',
      name: '7-Day Streak',
      description: 'Log meals 7 days in a row',
      icon: '🔥',
      unlocked: stats.longestStreak >= 7,
    },
    {
      id: 'level_5',
      name: 'Competitor',
      description: 'Reach level 5',
      icon: '⭐',
      unlocked: stats.level >= 5,
    },
    {
      id: 'century',
      name: 'Century Club',
      description: 'Log 100 meals total',
      icon: '💯',
      unlocked: stats.totalMealsLogged >= 100,
    },
    {
      id: 'streak_30',
      name: '30-Day Streak',
      description: 'Log meals 30 days straight',
      icon: '💎',
      unlocked: stats.longestStreak >= 30,
    },
    {
      id: 'challenge_win',
      name: 'Challenge Winner',
      description: 'Win your first challenge',
      icon: '🏆',
      unlocked: stats.challengesWon >= 1,
    },
  ];
}
