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
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthNavigator from './src/navigation/AuthNavigator';
import MainNavigator from './src/navigation/MainNavigator';
import ReactivateAccountScreen from './src/screens/main/ReactivateAccountScreen';
import ResetPasswordScreen from './src/screens/auth/ResetPasswordScreen';
import OnboardingGoalsScreen from './src/screens/onboarding/OnboardingGoalsScreen';
import TutorialScreen from './src/screens/onboarding/TutorialScreen';
import { useUserStore } from './src/store/userStore';
import { supabase } from './src/lib/supabase';
import { setMonitoringUser, reportError } from './src/lib/monitoring';
import { analytics } from './src/lib/analytics';
import {
  initNotifications,
  registerForPushNotifications,
  unregisterPushNotifications,
} from './src/services/notificationService';
import { ThemeProvider, useTheme } from './src/theme';

// The tutorial (the "what is MacroLeague" intro slides) is shown exactly once
// per account. We scope the seen-flag to the user id so it survives across
// sessions for that account but a brand-new account always sees it once.
const tutorialKeyFor = (userId: string) => `ml_tutorial_seen:${userId}`;

// Fire the "return session" analytics event at most once per cold start,
// whichever auth path (restored session or a fresh sign-in) reaches it first.
// is_returning is false only the very first time this install ever opens signed
// in; from then on the persisted flag marks the user as returning.
let sessionEventFired = false;
async function trackSessionStarted() {
  if (sessionEventFired) return;
  sessionEventFired = true;
  const SEEN_KEY = 'ml_analytics_seen_before';
  try {
    const seenBefore = (await AsyncStorage.getItem(SEEN_KEY)) === 'true';
    if (!seenBefore) await AsyncStorage.setItem(SEEN_KEY, 'true');
    analytics.sessionStarted({ isReturning: seenBefore });
  } catch {
    analytics.sessionStarted({ isReturning: false });
  }
}

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
      // Everything here is best-effort. A throw used to skip the `setLoading`
      // below and strand the app on its spinner forever — a corrupt stored
      // session or a captive-portal token refresh was enough to do it, and
      // ErrorBoundary cannot catch a rejected promise in an effect. The catch
      // degrades to the signed-out state, which is always recoverable.
      const { data: { session } } = await supabase.auth.getSession();

      if (!active) return;

      if (session?.user) {
        setMonitoringUser(session.user.id);
        analytics.identify(session.user.id);
        void trackSessionStarted();
        // Refresh this device's push token for the restored session. Fire-and-
        // forget and never prompting: a permission dialog on cold start is how
        // apps get permanently denied. See notificationService for the no-op
        // paths (simulator, web, no EAS id, permission not granted).
        void registerForPushNotifications();
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

    void init().catch((err) => {
      reportError(err, { context: 'App.init' });
      if (!active) return;
      // Fall back to the signed-out shell rather than an endless spinner: the
      // auth screen can retry, a spinner cannot.
      setTutorialSeen(true);
      setLoading(false);
    });

    // Foreground presentation + the Android notification channel every push
    // targets. Must exist before the first notification arrives; a no-op where
    // push is unavailable.
    void initNotifications();

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
          analytics.identify(session.user.id);
          void trackSessionStarted();
          // Bind this device's push token to the account that just signed in.
          // register_push_token() upserts on the token itself, so a shared
          // device MOVES to the new owner instead of double-registering.
          void registerForPushNotifications();
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
          analytics.reset();
          // Disable this device's token so the next person to sign in here does
          // not receive the departing user's streak reminders.
          void unregisterPushNotifications();
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
    analytics.onboardingTutorialCompleted();
    try {
      if (userId) await AsyncStorage.setItem(tutorialKeyFor(userId), 'true');
    } catch {}
    setTutorialSeen(true);
  }

  const notReady = !fontsLoaded || loading || tutorialSeen === null;

  return (
    // SafeAreaProvider must wrap the whole tree: Screen/Sheet/MainNavigator all
    // call useSafeAreaInsets(), which throws ("No safe area value available")
    // without a provider ancestor. We provide it explicitly rather than relying
    // on NavigationContainer's compat shim (which doesn't cover the web here and
    // wouldn't cover the loading screen rendered before navigation mounts).
    <SafeAreaProvider>
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
    </SafeAreaProvider>
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
