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
  });
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
