// Mock auth service — replace with real Supabase calls when project is set up

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  university: string;
  goalType: 'muscle' | 'lose_weight' | 'eat_cleaner' | 'just_track';
  dailyGoals: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  };
}

// Simulate network delay
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

let _currentUser: UserProfile | null = null;

export const mockAuth = {
  async signInWithEmail(email: string, password: string): Promise<UserProfile> {
    await delay(1200);
    if (password.length < 6) throw new Error('Invalid email or password.');
    _currentUser = {
      id: 'mock-user-1',
      email,
      name: 'Demo User',
      university: 'Rutgers University',
      goalType: 'muscle',
      dailyGoals: { calories: 2400, protein: 180, carbs: 240, fats: 80 },
    };
    return _currentUser;
  },

  async signUpWithEmail(
    email: string,
    password: string,
    name: string,
    university: string,
    goalType: UserProfile['goalType'],
    dailyGoals: UserProfile['dailyGoals']
  ): Promise<UserProfile> {
    await delay(1400);
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');
    _currentUser = {
      id: 'mock-user-' + Date.now(),
      email,
      name,
      university,
      goalType,
      dailyGoals,
    };
    return _currentUser;
  },

  async signInWithGoogle(): Promise<UserProfile> {
    await delay(1000);
    _currentUser = {
      id: 'mock-google-1',
      email: 'demo@rutgers.edu',
      name: 'Demo User',
      university: 'Rutgers University',
      goalType: 'muscle',
      dailyGoals: { calories: 2400, protein: 180, carbs: 240, fats: 80 },
    };
    return _currentUser;
  },

  getCurrentUser(): UserProfile | null {
    return _currentUser;
  },

  async signOut(): Promise<void> {
    await delay(300);
    _currentUser = null;
  },
};

// Auto-calculate macro targets based on goal
export function calculateMacros(goalType: UserProfile['goalType']): UserProfile['dailyGoals'] {
  switch (goalType) {
    case 'muscle':
      return { calories: 2800, protein: 200, carbs: 280, fats: 90 };
    case 'lose_weight':
      return { calories: 1800, protein: 160, carbs: 160, fats: 60 };
    case 'eat_cleaner':
      return { calories: 2200, protein: 150, carbs: 220, fats: 70 };
    case 'just_track':
    default:
      return { calories: 2000, protein: 130, carbs: 200, fats: 65 };
  }
}
