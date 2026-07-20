// Per-user rate limiting for the paid external-API surface.
//
// Backed by consume_api_quotas() (migration 0020), which counts and checks EVERY
// window in ONE atomic statement. Two properties matter here:
//
//   1. Atomicity. A read-then-write check in TypeScript would let two concurrent
//      requests both observe "one left" and both proceed.
//   2. One round trip. Callers check a burst window AND a daily window; doing
//      that as two sequential RPCs would put two network hops in front of every
//      request on the hot path. The plural RPC resolves both in one.
//
// FAIL-CLOSED: if the quota check itself errors (DB unreachable, RPC missing),
// we DENY. These limits guard real money; the safe default when we cannot prove
// a request is under budget is to refuse it. This is the opposite of the
// convention used for the app's non-critical reads, and it is deliberate.

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = any;

export interface QuotaWindow {
  /** Stable name for the counter, e.g. 'chat:burst'. Must be unique per call. */
  bucket: string;
  /** Maximum allowed uses within the window. */
  limit: number;
  /** Fixed window length in seconds. */
  windowSeconds: number;
  /** Human-readable window name used in the client-facing error message. */
  label: string;
}

export interface QuotaResult {
  allowed: boolean;
  /** Present when a specific window denied the request. */
  denied?: QuotaWindow;
  /** Seconds until the denying window resets; used for Retry-After. */
  retryAfterSeconds?: number;
}

/**
 * Row shape returned by consume_api_quotas().
 *
 * The r_ prefixes are not cosmetic: plpgsql substitutes OUT-parameter names for
 * identifiers in the query body, and an OUT parameter named `bucket` would
 * collide with the unqualified `bucket` that the function's ON CONFLICT
 * index-inference clause requires. See migration 0020 for the full note.
 */
interface QuotaRow {
  r_bucket: string;
  r_allowed: boolean;
  r_used: number;
  r_limit: number;
  r_reset_at: string;
}

/**
 * Consume one unit from every supplied window in a single round trip.
 *
 * When more than one window denies, the one reported is the window that resets
 * SOONEST — that is the earliest moment the caller could usefully retry, so it
 * is the honest value for Retry-After.
 */
export async function consumeQuotas(
  admin: SupabaseAdmin,
  userId: string,
  windows: QuotaWindow[],
): Promise<QuotaResult> {
  if (windows.length === 0) return { allowed: true };

  const { data, error } = await admin.rpc('consume_api_quotas', {
    p_user_id: userId,
    p_buckets: windows.map((w) => w.bucket),
    p_limits: windows.map((w) => w.limit),
    p_window_seconds: windows.map((w) => w.windowSeconds),
  });

  if (error) {
    // Fail closed — never spend money on an unverifiable request.
    console.error('[rateLimit] quota check failed:', error.message);
    const soonest = windows.reduce((a, b) => (a.windowSeconds <= b.windowSeconds ? a : b));
    return { allowed: false, denied: soonest, retryAfterSeconds: soonest.windowSeconds };
  }

  const rows: QuotaRow[] = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length === 0) {
    // The RPC answered with nothing — treat as unverifiable, not as permission.
    console.error('[rateLimit] quota check returned no rows');
    const soonest = windows.reduce((a, b) => (a.windowSeconds <= b.windowSeconds ? a : b));
    return { allowed: false, denied: soonest, retryAfterSeconds: soonest.windowSeconds };
  }

  const byBucket = new Map(windows.map((w) => [w.bucket, w]));
  let denied: QuotaWindow | undefined;
  let deniedResetMs = Number.POSITIVE_INFINITY;

  for (const row of rows) {
    if (row.r_allowed === true) continue;
    const window = byBucket.get(row.r_bucket);
    if (!window) continue;
    const resetMs = Date.parse(row.r_reset_at);
    const effective = Number.isFinite(resetMs)
      ? resetMs
      : Date.now() + window.windowSeconds * 1000;
    if (effective < deniedResetMs) {
      deniedResetMs = effective;
      denied = window;
    }
  }

  if (!denied) return { allowed: true };

  return {
    allowed: false,
    denied,
    retryAfterSeconds: Math.max(1, Math.ceil((deniedResetMs - Date.now()) / 1000)),
  };
}

/** User-facing 429 body + Retry-After. Never leaks limits of other buckets. */
export function rateLimitedResponse(
  result: QuotaResult,
  corsHeaders: Record<string, string>,
): Response {
  const label = result.denied?.label ?? 'this period';
  const retryAfter = result.retryAfterSeconds ?? 60;
  return new Response(
    JSON.stringify({
      error: `You've reached the limit for ${label}. Try again shortly.`,
      code: 'rate_limited',
      retryAfterSeconds: retryAfter,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
      },
    },
  );
}
