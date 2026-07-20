export interface UserProfile {
  id: string;
  username: string;
  name: string;
  email: string;
  university: string;
  preferredDiningHall?: string | null;
  goalType: 'muscle' | 'lose_weight' | 'eat_cleaner' | 'just_track';
  avatarUrl: string | null;
  /** IANA zone the backend buckets daily activity by; null until hydrated. */
  timezone?: string | null;
  xp: number;
  level: number;
  streakCount: number;
  longestStreak: number;
  totalMealsLogged: number;
  challengesWon: number;
  points: number;
  createdAt: string;
}

export interface DailyGoals {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface MealLog {
  id: string;
  userId: string;
  mealName: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  loggedAt: string;
  photoUrl: string | null;
  source: 'ai_scan' | 'search' | 'dining_hall' | 'manual';
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

export interface Challenge {
  id: string;
  name: string;
  type: 'solo' | 'team' | 'floor_vs_floor';
  goalTypes: string[];
  durationDays: number;
  stakesText: string;
  startDate: string;
  endDate: string;
  createdBy: string;
  participants: ChallengeParticipant[];
  goals: ChallengeGoal[];
  status: 'active' | 'upcoming' | 'completed';
}

export interface ChallengeParticipant {
  id: string;
  challengeId: string;
  userId: string;
  userName: string;
  avatarUrl: string | null;
  teamName: string;
  score: number;
}

export interface ChallengeGoal {
  id: string;
  challengeId: string;
  goalType: string;
  targetValue: number;
  pointsValue: number;
  completed?: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  university: string;
  avatarUrl: string | null;
  weeklyScore: number;
  streakCount: number;
}

export interface Reward {
  id: string;
  partnerName: string;
  partnerLogo: string;
  description: string;
  pointsCost: number;
  expiryDate: string;
  imageUrl: string | null;
  category: string;
}

export interface UserReward {
  id: string;
  userId: string;
  rewardId: string;
  redeemedAt: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
}

export interface ActivityFeedItem {
  id: string;
  userId: string;
  userName: string;
  actionType: 'meal_logged' | 'streak' | 'challenge_joined' | 'challenge_won' | 'reward_redeemed';
  metadata: string;
  createdAt: string;
}

export interface DiningHallItem {
  id: string;
  name: string;
  category: 'breakfast' | 'lunch' | 'dinner';
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  diningHall: string;
}
