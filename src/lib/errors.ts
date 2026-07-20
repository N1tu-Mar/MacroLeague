/**
 * Shared error normalization.
 *
 * Two problems this solves:
 *
 * 1. Failures reach the UI in three different shapes — `Error` instances,
 *    strings, and PostgREST-style `{ message, code, details, hint }` objects
 *    (the current @supabase/postgrest-js does subclass Error, but edge-function
 *    and RPC payloads still arrive as bare objects). `toError` collapses all of
 *    them into a real `Error` so `instanceof` checks downstream are reliable.
 *
 * 2. A dropped connection surfaces from `fetch` as the literal string
 *    "Network request failed", which was being rendered verbatim to users.
 *    `toUserFacingMessage` maps transport failures to copy a person can act on.
 *
 * We only ever read known fields — never dump the whole object — so nothing
 * sensitive can leak into UI copy or a Sentry title.
 */

export const OFFLINE_MESSAGE =
  "You're offline. Check your connection and try again.";

export const TIMEOUT_MESSAGE =
  'That took too long to respond. Check your connection and try again.';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Transport-level failures. React Native's fetch throws
 * `TypeError: Network request failed`; the others cover web, aborts, and the
 * Supabase client's own wrapper.
 */
const NETWORK_PATTERNS = [
  /network request failed/i,
  /failed to fetch/i,
  /network error/i,
  /networkerror/i,
  /connection (refused|reset|closed)/i,
  /enotfound|econnrefused|econnreset|etimedout/i,
];

const TIMEOUT_PATTERNS = [/timed? ?out/i, /aborted/i, /abort ?error/i];

/** Normalizes any thrown value into a real `Error`. */
export function toError(error: unknown): Error {
  if (error instanceof Error) return error;

  if (typeof error === 'string') {
    return new Error(error.trim() || GENERIC_MESSAGE);
  }

  if (error && typeof error === 'object') {
    const shaped = error as { message?: unknown; code?: unknown };
    const message = typeof shaped.message === 'string' ? shaped.message.trim() : '';
    const code = typeof shaped.code === 'string' ? shaped.code.trim() : '';
    if (message) {
      return new Error(code ? `${message} (${code})` : message);
    }
  }

  return new Error(GENERIC_MESSAGE);
}

/** True when the failure is a lost/absent connection rather than a real error. */
export function isOfflineError(error: unknown): boolean {
  const { message } = toError(error);
  return NETWORK_PATTERNS.some((pattern) => pattern.test(message));
}

/** True when the failure is a timeout or an aborted request. */
export function isTimeoutError(error: unknown): boolean {
  const normalized = toError(error);
  if (normalized.name === 'AbortError' || normalized.name === 'TimeoutError') {
    return true;
  }
  return TIMEOUT_PATTERNS.some((pattern) => pattern.test(normalized.message));
}

/**
 * The string to actually show a user. Transport failures become actionable
 * copy; everything else keeps its own message, since the services in this app
 * raise deliberately human-readable ones (quota, validation, not-found).
 *
 * `fallback` covers the case where an error carries no usable message.
 */
export function toUserFacingMessage(error: unknown, fallback = GENERIC_MESSAGE): string {
  if (isOfflineError(error)) return OFFLINE_MESSAGE;
  if (isTimeoutError(error)) return TIMEOUT_MESSAGE;

  const message = toError(error).message.trim();
  return message && message !== GENERIC_MESSAGE ? message : fallback;
}

/**
 * Rejects with a timeout once `ms` elapses. Supabase's client takes no timeout
 * option, so without this a stalled connection hangs a request forever and
 * leaves the UI stuck in its sending state with no way out.
 *
 * Note this bounds how long the *caller* waits, not the socket itself — the
 * underlying request may still complete and is simply ignored.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = 'request',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`The ${label} timed out.`);
      error.name = 'TimeoutError';
      reject(error);
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
