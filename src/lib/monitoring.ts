// Crash + error reporting via Sentry.
//
// The DSN is read from EXPO_PUBLIC_SENTRY_DSN. Like the rest of the app's keys,
// when it is absent every export here is a safe no-op — local dev and PR builds
// don't need a DSN and won't send anything. Set the DSN in your EAS build
// environment (and .env for local testing) to turn reporting on.
//
// The Sentry DSN is NOT a secret: it only permits *sending* events to your
// project, so shipping it in the client bundle (EXPO_PUBLIC_*) is expected and
// safe — the same way the Supabase anon key is public.
import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const sentryEnabled = !!dsn;

/** Call once, as early as possible (before rendering) in the app entry. */
export function initMonitoring(): void {
  if (!sentryEnabled) {
    // eslint-disable-next-line no-console
    if (__DEV__) console.log('[monitoring] Sentry disabled (no EXPO_PUBLIC_SENTRY_DSN).');
    return;
  }
  Sentry.init({
    dsn,
    // Don't attach PII (emails/IPs). We identify users only by opaque id below.
    sendDefaultPii: false,
    // Sample a fraction of transactions for performance monitoring; crashes are
    // always captured regardless of this rate.
    tracesSampleRate: 0.2,
    environment: __DEV__ ? 'development' : 'production',
    // RELEASE + DIST ARE WHAT MAKE PRODUCTION STACK TRACES READABLE.
    //
    // Without them Sentry cannot associate an event with the uploaded source
    // maps for that build, so every production crash arrives as minified frames
    // (`t.a is not a function` at bundle.js:1:284915) and is effectively
    // undebuggable. CI must upload source maps under the SAME release string —
    // see the sourcemap step in .github/workflows/ci.yml.
    //
    // EXPO_PUBLIC_RELEASE is set by the build (e.g. "macroleague@1.0.0+42").
    // When it is absent we fall back to the app version so events are at least
    // grouped by version rather than lumped together.
    release: releaseName(),
    dist: process.env.EXPO_PUBLIC_BUILD_NUMBER || undefined,
  });
}

/** Stable release identifier shared by the client and the CI sourcemap upload. */
export function releaseName(): string {
  const explicit = process.env.EXPO_PUBLIC_RELEASE;
  if (explicit) return explicit;

  const version = process.env.EXPO_PUBLIC_APP_VERSION ?? '1.0.0';
  const build = process.env.EXPO_PUBLIC_BUILD_NUMBER;
  return build ? `macroleague@${version}+${build}` : `macroleague@${version}`;
}

/** Associate subsequent events with a user (opaque id only — never email/PII). */
export function setMonitoringUser(userId: string | null): void {
  if (!sentryEnabled) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

/** Manually report a handled error with optional context. */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!sentryEnabled) {
    // eslint-disable-next-line no-console
    if (__DEV__) console.error('[monitoring] (not sent)', error, context);
    return;
  }
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

/** Wrap the root component so uncaught render errors are captured. Returns the
 *  component unchanged when reporting is disabled. */
export function wrapWithMonitoring<C>(component: C): C {
  return sentryEnabled ? (Sentry.wrap(component as never) as C) : component;
}
