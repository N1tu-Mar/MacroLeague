// Tests for the quota gate. Run with:  deno test supabase/functions/_shared/
//
// These cover the decisions that actually bound spend: that a single round trip
// is used, that a denial is reported against the window resetting soonest, and
// above all that every failure mode denies rather than allows.

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { consumeQuotas, rateLimitedResponse, type QuotaWindow } from './rateLimit.ts';

const BURST: QuotaWindow = {
  bucket: 'test:burst',
  limit: 2,
  windowSeconds: 60,
  label: 'messages this minute',
};
const DAILY: QuotaWindow = {
  bucket: 'test:daily',
  limit: 100,
  windowSeconds: 86400,
  label: 'messages today',
};

/** Minimal admin double recording how many RPC round trips were made. */
function fakeAdmin(
  respond: (args: Record<string, unknown>) => { data?: unknown; error?: { message: string } },
) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    // deno-lint-ignore no-explicit-any
    rpc(fn: string, args: Record<string, unknown>): any {
      calls.push({ fn, args });
      return Promise.resolve(respond(args));
    },
  };
}

function row(bucket: string, allowed: boolean, resetInSeconds: number) {
  return {
    r_bucket: bucket,
    r_allowed: allowed,
    r_used: allowed ? 1 : 99,
    r_limit: 2,
    r_reset_at: new Date(Date.now() + resetInSeconds * 1000).toISOString(),
  };
}

Deno.test('allows when every window is under its limit', async () => {
  const admin = fakeAdmin(() => ({
    data: [row(BURST.bucket, true, 30), row(DAILY.bucket, true, 3600)],
  }));

  const result = await consumeQuotas(admin, 'user-1', [BURST, DAILY]);

  assertEquals(result.allowed, true);
  assertEquals(result.denied, undefined);
});

Deno.test('checks all windows in a SINGLE round trip', async () => {
  const admin = fakeAdmin(() => ({
    data: [row(BURST.bucket, true, 30), row(DAILY.bucket, true, 3600)],
  }));

  await consumeQuotas(admin, 'user-1', [BURST, DAILY]);

  assertEquals(admin.calls.length, 1, 'expected exactly one RPC for two windows');
  assertEquals(admin.calls[0].fn, 'consume_api_quotas');
  assertEquals(admin.calls[0].args.p_buckets, [BURST.bucket, DAILY.bucket]);
  assertEquals(admin.calls[0].args.p_limits, [BURST.limit, DAILY.limit]);
  assertEquals(admin.calls[0].args.p_window_seconds, [
    BURST.windowSeconds,
    DAILY.windowSeconds,
  ]);
});

Deno.test('denies and reports the window that denied it', async () => {
  const admin = fakeAdmin(() => ({
    data: [row(BURST.bucket, false, 42), row(DAILY.bucket, true, 3600)],
  }));

  const result = await consumeQuotas(admin, 'user-1', [BURST, DAILY]);

  assertEquals(result.allowed, false);
  assertEquals(result.denied?.bucket, BURST.bucket);
  assert(
    result.retryAfterSeconds! > 30 && result.retryAfterSeconds! <= 42,
    `retryAfterSeconds should track the reset, got ${result.retryAfterSeconds}`,
  );
});

Deno.test('when several windows deny, reports the one resetting SOONEST', async () => {
  const admin = fakeAdmin(() => ({
    // Daily is listed first and denies, but burst frees up much sooner — the
    // burst window is the honest answer for "when can I retry".
    data: [row(DAILY.bucket, false, 7200), row(BURST.bucket, false, 20)],
  }));

  const result = await consumeQuotas(admin, 'user-1', [BURST, DAILY]);

  assertEquals(result.allowed, false);
  assertEquals(result.denied?.bucket, BURST.bucket);
  assert(result.retryAfterSeconds! <= 20);
});

Deno.test('FAILS CLOSED when the quota RPC errors', async () => {
  const admin = fakeAdmin(() => ({ error: { message: 'connection refused' } }));

  const result = await consumeQuotas(admin, 'user-1', [BURST, DAILY]);

  assertEquals(result.allowed, false, 'an unverifiable request must be refused');
  assertEquals(result.denied?.bucket, BURST.bucket, 'should back off by the shortest window');
});

Deno.test('FAILS CLOSED when the quota RPC returns no rows', async () => {
  const admin = fakeAdmin(() => ({ data: [] }));

  const result = await consumeQuotas(admin, 'user-1', [BURST, DAILY]);

  assertEquals(result.allowed, false, 'an empty answer is not permission');
});

Deno.test('FAILS CLOSED when the RPC returns null data', async () => {
  const admin = fakeAdmin(() => ({ data: null }));

  const result = await consumeQuotas(admin, 'user-1', [BURST, DAILY]);

  assertEquals(result.allowed, false);
});

Deno.test('tolerates an unparseable reset_at without allowing the request', async () => {
  const admin = fakeAdmin(() => ({
    data: [{ ...row(BURST.bucket, false, 60), r_reset_at: 'not-a-date' }],
  }));

  const result = await consumeQuotas(admin, 'user-1', [BURST]);

  assertEquals(result.allowed, false);
  assert(result.retryAfterSeconds! > 0, 'must still supply a usable Retry-After');
});

Deno.test('ignores rows for buckets that were not requested', async () => {
  const admin = fakeAdmin(() => ({
    data: [row(BURST.bucket, true, 30), row('someone-elses-bucket', false, 10)],
  }));

  const result = await consumeQuotas(admin, 'user-1', [BURST]);

  assertEquals(result.allowed, true);
});

Deno.test('no windows configured is a no-op that makes no RPC call', async () => {
  const admin = fakeAdmin(() => ({ data: [] }));

  const result = await consumeQuotas(admin, 'user-1', []);

  assertEquals(result.allowed, true);
  assertEquals(admin.calls.length, 0);
});

Deno.test('rateLimitedResponse is a 429 carrying Retry-After and CORS headers', async () => {
  const res = rateLimitedResponse(
    { allowed: false, denied: BURST, retryAfterSeconds: 45 },
    { 'Access-Control-Allow-Origin': 'https://macroleague.app' },
  );

  assertEquals(res.status, 429);
  assertEquals(res.headers.get('Retry-After'), '45');
  assertEquals(
    res.headers.get('Access-Control-Allow-Origin'),
    'https://macroleague.app',
    'a 429 must still be readable by the browser that triggered it',
  );

  const body = await res.json();
  assertEquals(body.code, 'rate_limited');
  assertEquals(body.retryAfterSeconds, 45);
  assert(
    body.error.includes(BURST.label),
    'the message should name the window the user actually hit',
  );
});
