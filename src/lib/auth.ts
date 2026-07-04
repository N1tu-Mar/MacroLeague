import { supabase } from './supabase';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
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
 * Shared Supabase web-OAuth redirect flow. Opens the provider's hosted login in an
 * in-app browser (native) or a full-page redirect (web), then completes the PKCE
 * code exchange to establish a session. Google always uses this; Apple uses it only
 * as the web/Android fallback (native iOS uses the Apple sheet — see signInWithApple).
 */
async function runWebOAuth(
  provider: 'google' | 'apple',
  providerLabel: string,
  queryParams?: Record<string, string>,
) {
  const redirectTo = getRedirectUri();

  // Log in dev so you can copy the exact URI into the Supabase dashboard allowlist.
  if (__DEV__) {
    console.log('[auth] OAuth redirectTo:', redirectTo);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      // Web: full-page redirect. Mobile: open an in-app browser session.
      skipBrowserRedirect: Platform.OS !== 'web',
      queryParams,
    },
  });

  if (error) {
    const msg = (error.message ?? '').toLowerCase();
    if (
      msg.includes('provider') ||
      msg.includes('unsupported') ||
      msg.includes('not enabled')
    ) {
      throw new Error(
        `${providerLabel} sign-in is not configured yet.\n\nEnable the ${providerLabel} provider in your Supabase dashboard under Authentication → Providers.`,
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
      const desc = url.searchParams.get('error_description') ?? urlError;
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

    throw new Error(`No authentication tokens received from ${providerLabel}.`);
  }

  if (result.type === 'cancel' || result.type === 'dismiss') {
    if (__DEV__) {
      console.warn(
        '[auth] OAuth cancelled. If auth completed but the app got no session, ' +
        'the redirectTo URI above is not in your Supabase Redirect URLs allowlist. ' +
        'Add it at: Supabase Dashboard → Authentication → URL Configuration → Redirect URLs'
      );
    }
    throw new Error('cancelled');
  }

  throw new Error(`${providerLabel} sign-in was cancelled`);
}

/**
 * Sign in with Google OAuth via Supabase (web redirect flow).
 */
export async function signInWithGoogle() {
  return runWebOAuth('google', 'Google', {
    access_type: 'offline',
    prompt: 'consent',
  });
}

/**
 * Whether the NATIVE "Sign in with Apple" sheet is available — iOS 13+ on a real
 * dev/standalone build. False on Android, web, and Expo Go, where the button falls
 * back to the Supabase web-OAuth flow instead. Screens use this to decide whether
 * to show the Apple button at all.
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Sign in with Apple. Required by App Store Review Guideline 4.8 whenever the app
 * offers another third-party login (we offer Google). On iOS this uses the NATIVE
 * Apple sheet (expo-apple-authentication) and exchanges the returned identity token
 * for a Supabase session via signInWithIdToken. Everywhere else it falls back to
 * the Supabase web-OAuth redirect.
 *
 * Security: Apple is handed a SHA-256 hash of a one-time nonce while Supabase gets
 * the raw nonce, so Supabase can verify the identity token wasn't replayed.
 */
export async function signInWithApple() {
  if (!(await isAppleSignInAvailable())) {
    return runWebOAuth('apple', 'Apple');
  }

  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (e: any) {
    // Tapping "Cancel" on the Apple sheet isn't worth surfacing.
    if (e?.code === 'ERR_REQUEST_CANCELED') throw new Error('cancelled');
    throw e;
  }

  if (!credential.identityToken) {
    throw new Error('No identity token returned from Apple.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });

  if (error) {
    const msg = (error.message ?? '').toLowerCase();
    if (
      msg.includes('provider') ||
      msg.includes('unsupported') ||
      msg.includes('not enabled')
    ) {
      throw new Error(
        'Apple sign-in is not configured yet.\n\nEnable the Apple provider in your Supabase dashboard under Authentication → Providers, and add the app bundle id (com.macroleague.app) as an authorized Client ID.',
      );
    }
    throw error;
  }

  // Apple returns the user's real name ONLY on the very first authorization. If we
  // got it and Supabase has no name yet, persist it so the new profile isn't
  // nameless (best-effort — the user can still set it during onboarding).
  const fullName = credential.fullName;
  const name = [fullName?.givenName, fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (name && !data.user?.user_metadata?.full_name) {
    try {
      await supabase.auth.updateUser({ data: { full_name: name } });
    } catch {
      // ignore — non-fatal
    }
  }

  return data;
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
