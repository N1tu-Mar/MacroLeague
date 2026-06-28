import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import {
  useFonts,
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthNavigator from './src/navigation/AuthNavigator';
import MainNavigator from './src/navigation/MainNavigator';
import ReactivateAccountScreen from './src/screens/main/ReactivateAccountScreen';
import OnboardingGoalsScreen from './src/screens/onboarding/OnboardingGoalsScreen';
import TutorialScreen from './src/screens/onboarding/TutorialScreen';
import { useUserStore } from './src/store/userStore';
import { supabase } from './src/lib/supabase';
import { Colors } from './src/theme';

const TUTORIAL_KEY = 'ml_tutorial_seen';

export default function App() {
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const isDeactivated = useUserStore((s) => s.isDeactivated);
  const needsOnboarding = useUserStore((s) => s.needsOnboarding);
  const login = useUserStore((s) => s.login);
  const logout = useUserStore((s) => s.logout);
  const refreshStats = useUserStore((s) => s.refreshStats);
  const refreshAccountStatus = useUserStore((s) => s.refreshAccountStatus);
  const [loading, setLoading] = useState(true);
  // null = not yet read from AsyncStorage (still loading); true/false = known
  const [tutorialSeen, setTutorialSeen] = useState<boolean | null>(null);

  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  useEffect(() => {
    let active = true;

    async function init() {
      // Run auth check and tutorial-seen read in parallel to keep startup fast
      const [{ data: { session } }, seenRaw] = await Promise.all([
        supabase.auth.getSession(),
        AsyncStorage.getItem(TUTORIAL_KEY).catch(() => null),
      ]);

      if (!active) return;

      setTutorialSeen(seenRaw === 'true');

      if (session?.user) {
        login({
          id: session.user.id,
          username: session.user.email?.split('@')[0] ?? 'user',
          name: session.user.user_metadata?.full_name ?? session.user.email?.split('@')[0] ?? 'Athlete',
          email: session.user.email ?? '',
          university: 'Rutgers University',
          goalType: 'muscle',
          avatarUrl: session.user.user_metadata?.avatar_url ?? null,
          xp: 0,
          level: 1,
          streakCount: 0,
          longestStreak: 0,
          totalMealsLogged: 0,
          challengesWon: 0,
          points: 0,
          createdAt: session.user.created_at,
        });
        // login() seeds zeros; immediately hydrate the real backend-owned
        // XP/points/streak/level and the needsOnboarding flag from the DB.
        void refreshStats();
        // Check whether this account is archived for deletion.
        void refreshAccountStatus();
      }

      setLoading(false);
    }

    void init();

    // Listen for auth changes (login/logout/OAuth callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          login({
            id: session.user.id,
            username: session.user.email?.split('@')[0] ?? 'user',
            name: session.user.user_metadata?.full_name ?? session.user.email?.split('@')[0] ?? 'Athlete',
            email: session.user.email ?? '',
            university: 'Rutgers University',
            goalType: 'muscle',
            avatarUrl: session.user.user_metadata?.avatar_url ?? null,
            xp: 0,
            level: 1,
            streakCount: 0,
            longestStreak: 0,
            totalMealsLogged: 0,
            challengesWon: 0,
            points: 0,
            createdAt: session.user.created_at,
          });
          // Hydrate real stats — this also resolves needsOnboarding from the DB.
          void refreshStats();
          void refreshAccountStatus();
        } else if (event === 'SIGNED_OUT') {
          logout();
        }
      }
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function markTutorialSeen() {
    try {
      await AsyncStorage.setItem(TUTORIAL_KEY, 'true');
    } catch {}
    setTutorialSeen(true);
  }

  if (!fontsLoaded || loading || tutorialSeen === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      {isAuthenticated ? (
        isDeactivated ? (
          <ReactivateAccountScreen />
        ) : needsOnboarding ? (
          <OnboardingGoalsScreen />
        ) : !tutorialSeen ? (
          <TutorialScreen onDone={markTutorialSeen} />
        ) : (
          <MainNavigator />
        )
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
