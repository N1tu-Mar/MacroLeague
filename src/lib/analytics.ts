// Product analytics — fans every event out to Amplitude and TelemetryDeck at
// once, so we can learn how students actually use MacroLeague and find things to
// improve. Both providers are driven by public client keys read from the
// environment (EXPO_PUBLIC_*), exactly like the Sentry DSN in ./monitoring.ts:
// when a key is absent that provider is a safe no-op, so local dev and PR builds
// send nothing. When BOTH are absent, tracking is disabled entirely and (in dev)
// each event is logged to the console instead so you can still see it fire.
//
// Why HTTP instead of native SDKs: TelemetryDeck has no first-party React Native
// SDK, and Amplitude's RN SDK is a native module that needs a config plugin and
// a rebuild. This app also runs on the web (react-native-web). Posting directly
// to each provider's public ingest API with fetch works identically on iOS,
// Android and web with zero native dependencies — and, like the Supabase anon
// key and Sentry DSN, these ingest keys are meant to ship in the client.
//
// Everything here is fire-and-forget: a failed or slow network request can never
// block the UI or throw into product code. We never send email/PII — users are
// identified only by their opaque Supabase id (the same id Sentry uses).
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

// ── Provider configuration ────────────────────────────────────────────────
const amplitudeApiKey = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY;
// TelemetryDeck identifies an app by its App ID (a UUID from the dashboard).
const telemetryDeckAppId = process.env.EXPO_PUBLIC_TELEMETRYDECK_APP_ID;

const AMPLITUDE_ENDPOINT = 'https://api2.amplitude.com/2/httpapi';
const TELEMETRYDECK_ENDPOINT = 'https://nom.telemetrydeck.com/v2/';

export const amplitudeEnabled = !!amplitudeApiKey;
export const telemetryDeckEnabled = !!telemetryDeckAppId;
export const analyticsEnabled = amplitudeEnabled || telemetryDeckEnabled;

// ── Identity / session state ──────────────────────────────────────────────
// One session id per cold start, so we can group events into app sessions.
const sessionId = Crypto.randomUUID();
const sessionStartMs = Date.now();

// The signed-in user's opaque id, or null while signed out. Set by identify().
let currentUserId: string | null = null;

// A stable anonymous id for this install, generated once and persisted. Resolved
// lazily (AsyncStorage is async) and cached as a promise so concurrent early
// events all await the same read/write instead of racing to create several ids.
const DEVICE_ID_KEY = 'ml_analytics_device_id';
let deviceIdPromise: Promise<string> | null = null;

function getDeviceId(): Promise<string> {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      try {
        const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
        if (existing) return existing;
        const fresh = Crypto.randomUUID();
        await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
        return fresh;
      } catch {
        // Storage unavailable: fall back to an in-memory id for this run so
        // events still have a stable device id within the session.
        return sessionId;
      }
    })();
  }
  return deviceIdPromise;
}

type EventProps = Record<string, string | number | boolean | null | undefined>;

/**
 * Associate subsequent events with a signed-in user (opaque id only — never an
 * email or other PII). Call on login and on session restore.
 */
export function identify(userId: string | null): void {
  currentUserId = userId;
}

/** Clear the associated user (call on sign-out). The device id persists. */
export function resetAnalytics(): void {
  currentUserId = null;
}

/**
 * Optional: call once at startup (from the app entry) to log which providers are
 * live. There is no SDK to initialize — keys are read at import time — so this is
 * purely a dev-time visibility aid and a no-op in production.
 */
export function initAnalytics(): void {
  if (!__DEV__) return;
  if (!analyticsEnabled) {
    // eslint-disable-next-line no-console
    console.log(
      '[analytics] disabled (set EXPO_PUBLIC_AMPLITUDE_API_KEY and/or EXPO_PUBLIC_TELEMETRYDECK_APP_ID).',
    );
    return;
  }
  const providers = [
    amplitudeEnabled ? 'Amplitude' : null,
    telemetryDeckEnabled ? 'TelemetryDeck' : null,
  ].filter(Boolean);
  // eslint-disable-next-line no-console
  console.log(`[analytics] enabled: ${providers.join(', ')}.`);
}

// ── Provider transports ───────────────────────────────────────────────────
async function sendToAmplitude(event: string, props: EventProps, deviceId: string): Promise<void> {
  if (!amplitudeEnabled) return;
  const body = {
    api_key: amplitudeApiKey,
    events: [
      {
        // Amplitude requires user_id OR device_id; we always have a device id.
        ...(currentUserId ? { user_id: currentUserId } : {}),
        device_id: deviceId,
        event_type: event,
        time: Date.now(),
        session_id: sessionStartMs,
        platform: Platform.OS,
        event_properties: props,
      },
    ],
  };
  await fetch(AMPLITUDE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: '*/*' },
    body: JSON.stringify(body),
  });
}

async function sendToTelemetryDeck(event: string, props: EventProps, deviceId: string): Promise<void> {
  if (!telemetryDeckEnabled) return;
  // TelemetryDeck payload values are strings; flatten everything to strings and
  // drop undefined/null so we never send "undefined". clientUser must be
  // non-empty — the opaque user id when known, else the anonymous device id
  // (TelemetryDeck hashes it server-side).
  const payload: Record<string, string> = { platform: Platform.OS };
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined && value !== null) payload[key] = String(value);
  }
  const body = [
    {
      appID: telemetryDeckAppId,
      clientUser: currentUserId ?? deviceId,
      sessionID: sessionId,
      type: event,
      payload,
    },
  ];
  await fetch(TELEMETRYDECK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Record a product-analytics event. Fire-and-forget: it never throws, never
 * blocks, and quietly swallows network failures. Fans out to every enabled
 * provider. When no provider is configured, logs the event in dev and is a
 * complete no-op in production.
 */
export function track(event: string, props: EventProps = {}): void {
  if (!analyticsEnabled) {
    // eslint-disable-next-line no-console
    if (__DEV__) console.log('[analytics] (not sent)', event, props);
    return;
  }
  // Resolve the device id, then dispatch to both providers. Each provider and
  // the whole chain swallow errors so analytics can never surface to the user.
  void getDeviceId()
    .then((deviceId) =>
      Promise.allSettled([
        sendToAmplitude(event, props, deviceId),
        sendToTelemetryDeck(event, props, deviceId),
      ]),
    )
    .catch(() => {
      /* analytics must never break the app */
    });
}

// ── Named events ──────────────────────────────────────────────────────────
// One helper per tracked moment so call sites stay declarative and event names
// (and their properties) are defined in exactly one place. These are the five
// funnels we care about first: onboarding, first meal, return sessions,
// challenge participation, and reward views.
export const analytics = {
  identify,
  reset: resetAnalytics,
  track,

  // Onboarding — the goal/macro setup step and the intro tutorial that follows.
  onboardingGoalsCompleted: (goalType: string) =>
    track('onboarding_goals_completed', { goal_type: goalType }),
  onboardingTutorialCompleted: () => track('onboarding_tutorial_completed'),

  // Meals — every confirmed insert, with a dedicated first-ever-meal event so
  // the activation funnel is a single clean signal.
  mealLogged: (opts: { isFirst: boolean; mealType: string; source: string }) =>
    track('meal_logged', {
      is_first: opts.isFirst,
      meal_type: opts.mealType,
      source: opts.source,
    }),
  firstMealLogged: (opts: { mealType: string; source: string }) =>
    track('first_meal_logged', { meal_type: opts.mealType, source: opts.source }),

  // Sessions — fired once per cold start when a user is signed in. is_returning
  // distinguishes a brand-new install from someone coming back.
  sessionStarted: (opts: { isReturning: boolean }) =>
    track('session_started', { is_returning: opts.isReturning }),

  // Challenges — joining is the participation signal; creating and leaving are
  // tracked too for a fuller picture of engagement.
  challengeJoined: (opts: { challengeId: string; type: string; goalType: string }) =>
    track('challenge_joined', {
      challenge_id: opts.challengeId,
      type: opts.type,
      goal_type: opts.goalType,
    }),
  challengeCreated: (opts: { type: string; goalType: string; durationDays: number }) =>
    track('challenge_created', {
      type: opts.type,
      goal_type: opts.goalType,
      duration_days: opts.durationDays,
    }),
  challengeLeft: (opts: { challengeId: string }) =>
    track('challenge_left', { challenge_id: opts.challengeId }),

  // Rewards — viewing the catalog, opening a specific reward, and redeeming.
  rewardsViewed: (opts: { balance: number; rewardCount: number }) =>
    track('rewards_viewed', { balance: opts.balance, reward_count: opts.rewardCount }),
  rewardDetailViewed: (opts: { rewardId: string; partnerName: string; pointsCost: number }) =>
    track('reward_detail_viewed', {
      reward_id: opts.rewardId,
      partner_name: opts.partnerName,
      points_cost: opts.pointsCost,
    }),
  rewardRedeemed: (opts: { rewardId: string; partnerName: string; pointsCost: number }) =>
    track('reward_redeemed', {
      reward_id: opts.rewardId,
      partner_name: opts.partnerName,
      points_cost: opts.pointsCost,
    }),
};
