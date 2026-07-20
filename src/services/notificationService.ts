// Push notifications — permission, device-token registration, and server-side
// preferences.
//
// NO-OP WHEN UNCONFIGURED, exactly like src/lib/monitoring.ts (Sentry) and
// src/lib/analytics.ts (Amplitude/TelemetryDeck): without an EAS project id, on
// a simulator, on the web, or with permission denied, every export here returns
// a benign value and never throws. Push is a nice-to-have layered on top of the
// app; it must never be able to break sign-in or the settings screen.
//
// expo-notifications is imported LAZILY (await import) rather than at module
// scope. That is deliberate: the package is a native module, and a static import
// would make this module — and therefore App.tsx's auth path — fail to evaluate
// anywhere the native side is absent (web bundles, jest, an Expo Go build
// without the plugin). Loading it on demand inside a try means those
// environments fall through to the disabled path instead.
//
// Preferences are stored SERVER-side (notification_preferences, migration 0023),
// not in AsyncStorage. They have to be: the thing that reads them is the
// `send-notifications` edge function, which has no access to a phone's local
// storage. A device-local preference could never actually stop a push.
import { Platform, Linking } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { reportError } from '../lib/monitoring';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  isValidExpoPushToken,
  normalizePreferences,
  type NotificationPreferences,
} from '../lib/pushNotifications';

export type { NotificationPreferences };
export { DEFAULT_NOTIFICATION_PREFERENCES };

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/**
 * The EAS project id Expo needs to mint a push token. Read from the same place
 * `expo-notifications` reads it, with the older `easConfig` location as a
 * fallback for dev clients. Null here means push is simply off.
 */
function easProjectId(): string | null {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  const fromEasConfig = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig
    ?.projectId;
  return fromExtra ?? fromEasConfig ?? null;
}

/**
 * Push is only possible on a real iOS/Android device with an EAS project id.
 * react-native-web has no push surface here, and a simulator cannot receive
 * APNs/FCM messages, so both are treated as "not configured" rather than errors.
 */
export function pushSupported(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  return !!easProjectId() && Constants.isDevice !== false;
}

/**
 * The slice of expo-notifications this file uses, declared structurally rather
 * than with `typeof import('expo-notifications')`.
 *
 * WHY: the import below is resolved at RUNTIME through a non-literal specifier
 * so the bundler never statically pulls a native module into the web/jest
 * builds. A `typeof import(...)` type would reintroduce a hard compile-time
 * dependency on the package's types, which also means `npx tsc --noEmit` fails
 * on a checkout that has not run `npm install` yet. This interface is the exact
 * surface we call; anything outside it is intentionally unreachable from here.
 */
type PermissionResponseLike = { status: string; canAskAgain?: boolean };
interface NotificationsModule {
  setNotificationHandler(handler: unknown): void;
  setNotificationChannelAsync(id: string, channel: Record<string, unknown>): Promise<unknown>;
  getPermissionsAsync(): Promise<PermissionResponseLike>;
  requestPermissionsAsync(): Promise<PermissionResponseLike>;
  getExpoPushTokenAsync(options: { projectId: string }): Promise<{ data: string }>;
  AndroidImportance: Record<string, number>;
  AndroidNotificationVisibility: Record<string, number>;
}

// Resolved once. `undefined` = not tried yet, `null` = tried and unavailable (so
// we don't retry a failing dynamic import on every call).
let notificationsModule: NotificationsModule | null | undefined;

// Metro resolves `require` with a LITERAL specifier at bundle time (a variable
// specifier would simply never resolve on device), so the literal is required
// for this to work at all. It is declared locally because this project has no
// @types/node; the try/catch is what makes the missing-module case safe.
declare const require: (id: string) => unknown;

async function loadNotifications(): Promise<NotificationsModule | null> {
  if (notificationsModule !== undefined) return notificationsModule;
  try {
    notificationsModule = require('expo-notifications') as NotificationsModule;
  } catch {
    // Native module absent (web, jest, Expo Go without the plugin). Disabled.
    notificationsModule = null;
  }
  return notificationsModule;
}

/**
 * Configure how a notification behaves while the app is FOREGROUNDED, and create
 * the Android channel every message targets (`channelId: 'default'` in the edge
 * function). Android will not display a notification without a channel, so this
 * has to run before the first push arrives — call it once at startup.
 *
 * Safe to call anywhere: it resolves to nothing when push is unavailable.
 */
export async function initNotifications(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'MacroLeague',
        importance: Notifications.AndroidImportance.DEFAULT,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
  } catch (error) {
    reportError(error, { where: 'initNotifications' });
  }
}

/** Current OS permission, without prompting. */
export async function getPermissionState(): Promise<PermissionState> {
  if (!pushSupported()) return 'unavailable';
  const Notifications = await loadNotifications();
  if (!Notifications) return 'unavailable';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'unavailable';
  }
}

/**
 * Ask for permission if it has not been decided yet.
 *
 * Deliberately does NOT re-prompt when already denied: iOS shows the system
 * dialog exactly once, and a second requestPermissionsAsync() resolves
 * instantly as 'denied' without any UI. The caller is expected to send the user
 * to system settings in that case (see openSystemSettings).
 */
export async function requestPermission(): Promise<PermissionState> {
  if (!pushSupported()) return 'unavailable';
  const Notifications = await loadNotifications();
  if (!Notifications) return 'unavailable';
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status === 'granted') return 'granted';
    if (!existing.canAskAgain) return 'denied';
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') return 'granted';
    return status === 'denied' ? 'denied' : 'undetermined';
  } catch (error) {
    reportError(error, { where: 'requestPermission' });
    return 'unavailable';
  }
}

/** Open the OS settings page for this app so a denied user can turn push on. */
export async function openSystemSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // Nothing to do — the screen already tells the user where to go.
  }
}

/** The device's Expo push token, or null when push is unavailable/denied. */
export async function getExpoPushToken(): Promise<string | null> {
  if (!pushSupported()) return null;
  const Notifications = await loadNotifications();
  if (!Notifications) return null;
  const projectId = easProjectId();
  if (!projectId) return null;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    return isValidExpoPushToken(result?.data) ? result.data : null;
  } catch (error) {
    // A missing APNs/FCM credential surfaces here. Report it, but never throw:
    // sign-in must not fail because push credentials are not set up yet.
    reportError(error, { where: 'getExpoPushToken' });
    return null;
  }
}

// The token registered during this app run, remembered so sign-out can disable
// exactly the token we registered without asking the OS for it again.
let registeredToken: string | null = null;

/**
 * Register this device's token for the signed-in user.
 *
 * `promptIfNeeded` is false by default: this runs on every sign-in, and a
 * permission dialog that appears the instant a user lands in the app is the
 * classic way to get permanently denied. The Notifications settings screen
 * passes true, where the ask is explicit and expected.
 *
 * Returns the token on success, null in every other case (unsupported, not
 * permitted, no session, RPC failure) — never throws.
 */
export async function registerForPushNotifications(
  opts: { promptIfNeeded?: boolean } = {},
): Promise<string | null> {
  if (!pushSupported()) return null;

  const state = opts.promptIfNeeded ? await requestPermission() : await getPermissionState();
  if (state !== 'granted') return null;

  const token = await getExpoPushToken();
  if (!token) return null;

  try {
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS,
      // Stable-ish per install; only used to tell a user's devices apart in
      // support/debugging, never for identity.
      p_device_id: Constants.sessionId ?? null,
    });
    if (error) {
      reportError(error, { where: 'registerForPushNotifications' });
      return null;
    }
  } catch (error) {
    reportError(error, { where: 'registerForPushNotifications' });
    return null;
  }

  registeredToken = token;
  return token;
}

/**
 * Stop this device receiving the departing user's notifications. Called on
 * sign-out — without it, the next person to sign in on a shared phone would keep
 * getting the previous account's streak reminders.
 */
export async function unregisterPushNotifications(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  try {
    await supabase.rpc('disable_push_token', { p_token: token });
  } catch {
    // Sign-out must always complete. The server also disables the token on the
    // next DeviceNotRegistered ticket, so a missed call is self-healing.
  }
}

// ── Preferences (server-side) ─────────────────────────────────────────────

/**
 * The caller's preferences. The RPC creates the row on first read, so a brand
 * new account still gets a complete object. Falls back to the documented
 * defaults on any failure rather than surfacing an error — the settings screen
 * separately reports load failures via its own error state.
 */
export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const { data, error } = await supabase.rpc('get_notification_preferences');
  if (error) throw new Error(error.message);
  // The RPC returns a composite type; supabase-js may hand it back as a single
  // row or a one-element array depending on how the type is resolved.
  const row = Array.isArray(data) ? data[0] : data;
  return normalizePreferences(row);
}

/**
 * Update one or more preferences. Every field is optional and omitted fields are
 * left untouched server-side, so flipping one switch cannot clobber another
 * switch changed on a different device a moment earlier.
 */
export async function updateNotificationPreferences(
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const { data, error } = await supabase.rpc('update_notification_preferences', {
    p_streak_reminders: patch.streak_reminders ?? null,
    p_challenge_updates: patch.challenge_updates ?? null,
    p_friend_activity: patch.friend_activity ?? null,
    p_weekly_report: patch.weekly_report ?? null,
    p_rewards: patch.rewards ?? null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return normalizePreferences(row);
}
