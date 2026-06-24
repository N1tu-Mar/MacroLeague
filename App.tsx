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
import AuthNavigator from './src/navigation/AuthNavigator';
import MainNavigator from './src/navigation/MainNavigator';
import { useUserStore } from './src/store/userStore';
import { supabase } from './src/lib/supabase';
import { Colors } from './src/theme';

export default function App() {
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const login = useUserStore((s) => s.login);
  const logout = useUserStore((s) => s.logout);
  const refreshStats = useUserStore((s) => s.refreshStats);
  const [loading, setLoading] = useState(true);

  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  // Listen for Supabase auth state changes
  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
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
        // XP/points/streak/level so the UI never shows a stale zeroed account.
        void refreshStats();
      }
      setLoading(false);
    });

    // Listen for auth changes (login/logout)
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
          // Hydrate real backend stats right after a fresh sign-in.
          void refreshStats();
        } else if (event === 'SIGNED_OUT') {
          logout();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  if (!fontsLoaded || loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
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
