import { supabase } from './supabase';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

/**
 * Returns the correct redirect URI for the current environment:
 *   - Web               → http://localhost:8081 (current origin)
 *   - Expo Go           → exp://192.168.x.x:8081/--/auth  (dynamic, set via Supabase wildcard)
 *   - Dev client / EAS  → macroleague://auth
 *   - Standalone        → macroleague://auth
 */
function getRedirectUri(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }

  const isExpoGo =
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

  if (isExpoGo) {
    // In Expo Go the scheme is always exp://, makeRedirectUri respects that
    return makeRedirectUri({ path: 'auth' });
  }

  // Dev client or standalone build — use the custom scheme
  return makeRedirectUri({ scheme: 'macroleague', path: 'auth' });
}

/**
 * Sign in with email/password
 */
export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * Sign up with email/password
 */
export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * Sign in with Google OAuth via Supabase
 */
export async function signInWithGoogle() {
  const redirectTo = getRedirectUri();

  // Log in dev so you can copy the exact URI into Supabase dashboard
  if (__DEV__) {
    console.log('[auth] OAuth redirectTo:', redirectTo);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      // Web: full-page redirect. Mobile: open an in-app browser session.
      skipBrowserRedirect: Platform.OS !== 'web',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    const msg = error.message ?? '';
    if (
      msg.toLowerCase().includes('provider') ||
      msg.toLowerCase().includes('unsupported') ||
      msg.toLowerCase().includes('not enabled')
    ) {
      throw new Error(
        'Google sign-in is not configured yet.\n\nEnable the Google provider in your Supabase dashboard under Authentication → Providers.'
      );
    }
    throw error;
  }

  if (Platform.OS === 'web') {
    // Supabase redirects the browser when skipBrowserRedirect is false.
    return data;
  }

  if (!data.url) throw new Error('No OAuth URL returned from Supabase.');

  // Open OAuth URL in the system browser / SFSafariViewController
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === 'success' && result.url) {
    const url = new URL(result.url);

    // Catch error params returned in the redirect URL
    const urlError = url.searchParams.get('error');
    if (urlError) {
      const desc =
        url.searchParams.get('error_description') ?? urlError;
      throw new Error(desc.replace(/\+/g, ' '));
    }

    // PKCE flow — Supabase returns a `code` query param
    const code = url.searchParams.get('code');
    if (code) {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.exchangeCodeForSession(code);
      if (sessionError) throw sessionError;
      return sessionData;
    }

    // Implicit flow — tokens in the URL fragment
    const fragment = url.hash.substring(1);
    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (accessToken && refreshToken) {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      if (sessionError) throw sessionError;
      return sessionData;
    }

    throw new Error('No authentication tokens received from Google.');
  }

  if (result.type === 'cancel' || result.type === 'dismiss') {
    if (__DEV__) {
      console.warn(
        '[auth] OAuth cancelled. If Google auth completed but the app got no session, ' +
        'the redirectTo URI above is not in your Supabase Redirect URLs allowlist. ' +
        'Add it at: Supabase Dashboard → Authentication → URL Configuration → Redirect URLs'
      );
    }
    throw new Error('cancelled');
  }

  throw new Error('Google sign-in was cancelled');
}

/**
 * Send a password-reset email. Supabase emails the user a recovery link that,
 * when opened, returns them to the app in a temporary recovery session (the
 * `PASSWORD_RECOVERY` auth event) where they can set a new password via
 * `updatePassword`. `redirectTo` uses the same per-environment URI as OAuth so
 * the link reopens the app (native) or the site (web).
 *
 * Note: we do NOT reveal whether the email exists — Supabase always resolves
 * successfully — so this can't be used to enumerate accounts.
 */
export async function sendPasswordReset(email: string) {
  const redirectTo = getRedirectUri();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  });
  if (error) throw error;
}

/**
 * Set a new password. Only works while a session exists — either the normal
 * signed-in session (change password from settings) or the temporary recovery
 * session established after following a reset link.
 */
export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/**
 * Sign out
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Get current session
 */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}
