import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  BarlowCondensed_500Medium,
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
} from '@expo-google-fonts/barlow-condensed';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthNavigator from './src/navigation/AuthNavigator';
import MainNavigator from './src/navigation/MainNavigator';
import ReactivateAccountScreen from './src/screens/main/ReactivateAccountScreen';
import ResetPasswordScreen from './src/screens/auth/ResetPasswordScreen';
import OnboardingGoalsScreen from './src/screens/onboarding/OnboardingGoalsScreen';
import TutorialScreen from './src/screens/onboarding/TutorialScreen';
import { useUserStore } from './src/store/userStore';
import { supabase } from './src/lib/supabase';
import { setMonitoringUser } from './src/lib/monitoring';
import { ThemeProvider, useTheme } from './src/theme';

// The tutorial (the "what is MacroLeague" intro slides) is shown exactly once
// per account. We scope the seen-flag to the user id so it survives across
// sessions for that account but a brand-new account always sees it once.
const tutorialKeyFor = (userId: string) => `ml_tutorial_seen:${userId}`;

export default function App() {
  const userId = useUserStore((s) => s.user?.id ?? null);
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
  // True after the user follows a password-reset link (Supabase PASSWORD_RECOVERY
  // event). While true we render the "set a new password" screen over everything
  // else, since the recovery session is only meant for exactly that.
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    BarlowCondensed_500Medium,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
  });

  useEffect(() => {
    let active = true;

    async function init() {
      const { data: { session } } = await supabase.auth.getSession();

      if (!active) return;

      if (session?.user) {
        setMonitoringUser(session.user.id);
        // Read the per-account tutorial flag now that we know who is signed in.
        const seenRaw = await AsyncStorage.getItem(tutorialKeyFor(session.user.id)).catch(() => null);
        if (!active) return;
        setTutorialSeen(seenRaw === 'true');

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
      } else {
        // No session: the tutorial gate is irrelevant (AuthNavigator renders),
        // so unblock the loading spinner.
        setTutorialSeen(true);
      }

      setLoading(false);
    }

    void init();

    // Listen for auth changes (login/logout/OAuth callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          // The recovery link put us in a temporary session. Show the reset
          // screen; ResetPasswordScreen signs out on success.
          setPasswordRecovery(true);
          return;
        }
        if (event === 'SIGNED_IN' && session?.user) {
          setMonitoringUser(session.user.id);
          // Resolve the per-account tutorial flag for this user.
          AsyncStorage.getItem(tutorialKeyFor(session.user.id))
            .then((seenRaw) => {
              if (active) setTutorialSeen(seenRaw === 'true');
            })
            .catch(() => {
              if (active) setTutorialSeen(false);
            });
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
          setMonitoringUser(null);
          setPasswordRecovery(false);
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
      if (userId) await AsyncStorage.setItem(tutorialKeyFor(userId), 'true');
    } catch {}
    setTutorialSeen(true);
  }

  const notReady = !fontsLoaded || loading || tutorialSeen === null;

  return (
    <ThemeProvider>
      <AppRoot
        notReady={notReady}
        passwordRecovery={passwordRecovery}
        isAuthenticated={isAuthenticated}
        isDeactivated={isDeactivated}
        needsOnboarding={needsOnboarding}
        tutorialSeen={tutorialSeen === true}
        onTutorialDone={markTutorialSeen}
        onResetDone={() => setPasswordRecovery(false)}
      />
    </ThemeProvider>
  );
}

type AppRootProps = {
  notReady: boolean;
  passwordRecovery: boolean;
  isAuthenticated: boolean;
  isDeactivated: boolean;
  needsOnboarding: boolean;
  tutorialSeen: boolean;
  onTutorialDone: () => void;
  onResetDone: () => void;
};

// Rendered inside ThemeProvider so the status bar, loading screen and
// navigation background all follow the active (light/dark) palette.
function AppRoot({
  notReady,
  passwordRecovery,
  isAuthenticated,
  isDeactivated,
  needsOnboarding,
  tutorialSeen,
  onTutorialDone,
  onResetDone,
}: AppRootProps) {
  const { colors, isDark } = useTheme();
  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: colors.canvas },
  };

  if (notReady) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.canvas }]}>
        <ActivityIndicator color={colors.scarlet} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {passwordRecovery ? (
        <ResetPasswordScreen onDone={onResetDone} />
      ) : isAuthenticated ? (
        isDeactivated ? (
          <ReactivateAccountScreen />
        ) : needsOnboarding ? (
          <OnboardingGoalsScreen />
        ) : !tutorialSeen ? (
          <TutorialScreen onDone={onTutorialDone} />
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
    alignItems: 'center',
    justifyContent: 'center',
  },
});
