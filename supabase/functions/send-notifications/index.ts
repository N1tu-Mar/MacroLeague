// `send-notifications` edge function.
//
// The ONLY place that delivers a push. It is NOT user-facing: an hourly schedule
// (migration 0023) invokes it with a shared secret. It claims a batch of queued
// notifications, fans each one out to every live device token for that user via
// the Expo Push API, disables tokens Expo reports as dead, and records the
// outcome back onto the queue row.
//
// Protected by a secret header instead of a user JWT (verify_jwt = false in
// config.toml), so it can be driven by pg_cron but not by random callers — the
// same posture as `purge-accounts`, and for the same reason: this endpoint can
// message every user of the app.
//
// Trigger header:  x-cron-secret: <PUSH_NOTIFICATIONS_SECRET>
//
// FAIL-CLOSED: if the secret is unset, or the header does not match, it refuses.
// A misconfigured environment sends nothing; it never sends to everyone.
//
// PREFERENCES ARE RE-CHECKED HERE, AT SEND TIME. claim_notification_batch()
// returns preference_on computed from the CURRENT notification_preferences row,
// not from whatever was true when the row was enqueued. A user who switched a
// kind off in the meantime gets 'skipped', not a push.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeadersFor, preflightResponse, rejectDisallowedOrigin } from '../_shared/cors.ts';
import { verifyCronSecret } from '../_shared/secret.ts';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

// Expo rejects a request carrying more than 100 messages. Mirrors
// EXPO_PUSH_BATCH_LIMIT in src/lib/pushNotifications.ts (unit tested there).
const EXPO_PUSH_BATCH_LIMIT = 100;

// How many queue rows one invocation claims. One row can expand into several
// messages (one per device), so the message count is >= this.
const CLAIM_LIMIT = 200;

// Attempts before a row is parked as permanently 'failed'.
const MAX_ATTEMPTS = 3;

type ClaimedRow = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  attempts: number;
  tokens: string[] | null;
  preference_on: boolean;
};

type ExpoTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

/** Split into chunks of at most `size`. Same contract as chunk() in src/lib. */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflightResponse(req);

  // Refuse a disallowed browser Origin before any work happens. Native/cron
  // callers send no Origin and are unaffected (see _shared/cors.ts).
  const blocked = rejectDisallowedOrigin(req);
  if (blocked) return blocked;

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405, req);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cronSecret = Deno.env.get('PUSH_NOTIFICATIONS_SECRET');
  // OPTIONAL. Only needed if the Expo project has "Enhanced Security for Push
  // Notifications" enabled. Absent = unauthenticated Expo push, which is the
  // default and works fine.
  const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server is missing Supabase configuration.' }, 500, req);
  }
  // Fail-closed (unset secret → deny) AND constant-time compare, so response
  // latency can't be used to recover this send-to-everyone secret.
  if (!verifyCronSecret(cronSecret, req.headers.get('x-cron-secret'))) {
    return json({ error: 'Forbidden.' }, 403, req);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Claim atomically: `for update skip locked` inside the RPC means a second,
  // overlapping run takes different rows rather than re-sending these.
  const { data: claimed, error: claimError } = await admin.rpc('claim_notification_batch', {
    p_limit: CLAIM_LIMIT,
  });

  if (claimError) {
    console.error('[send-notifications] claim failed', claimError.message);
    return json({ error: claimError.message }, 500, req);
  }

  const rows = (claimed ?? []) as ClaimedRow[];
  if (rows.length === 0) {
    return json({ claimed: 0, sent: 0, skipped: 0, failed: 0, tokensDisabled: 0 }, 200, req);
  }

  // Partition before doing any network work. A row is skipped (terminal, not a
  // failure) when the user opted out or has no live device — retrying either
  // would never succeed.
  const sendable: ClaimedRow[] = [];
  const skipped: string[] = [];
  for (const row of rows) {
    if (!row.preference_on) {
      skipped.push(row.id);
    } else if (!row.tokens || row.tokens.length === 0) {
      skipped.push(row.id);
    } else {
      sendable.push(row);
    }
  }

  // One Expo message per (row, token). The row id rides along on each message so
  // a ticket can be mapped back to the queue row it came from — Expo returns
  // tickets positionally, so the index mapping must be kept explicitly.
  type OutgoingMessage = {
    rowId: string;
    token: string;
    message: Record<string, unknown>;
  };

  const outgoing: OutgoingMessage[] = [];
  for (const row of sendable) {
    for (const token of row.tokens ?? []) {
      outgoing.push({
        rowId: row.id,
        token,
        message: {
          to: token,
          title: row.title,
          body: row.body,
          data: { ...(row.data ?? {}), kind: row.kind, queue_id: row.id },
          sound: 'default',
          // Collapse repeats of the same kind on the device rather than stacking
          // several identical nudges in the shade.
          channelId: 'default',
          priority: 'high',
        },
      });
    }
  }

  // Per-row outcome. A row succeeds if AT LEAST ONE of its devices accepted it:
  // a user with a live phone and a stale tablet token has been reached, and
  // retrying would double-notify the phone.
  const rowOk = new Set<string>();
  const rowErr = new Map<string, string>();
  const deadTokens = new Set<string>();

  for (const batch of chunk(outgoing, EXPO_PUSH_BATCH_LIMIT)) {
    let tickets: ExpoTicket[] = [];
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      };
      if (expoAccessToken) headers.Authorization = `Bearer ${expoAccessToken}`;

      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch.map((m) => m.message)),
      });

      if (!response.ok) {
        // A transport/quota failure is retryable — mark the whole batch failed
        // and let the attempt ceiling decide when to stop.
        const text = await response.text().catch(() => '');
        const reason = `Expo push HTTP ${response.status}: ${text.slice(0, 200)}`;
        for (const m of batch) if (!rowOk.has(m.rowId)) rowErr.set(m.rowId, reason);
        console.error('[send-notifications]', reason);
        continue;
      }

      const payload = (await response.json()) as { data?: ExpoTicket[]; errors?: unknown };
      tickets = payload.data ?? [];
    } catch (err) {
      const reason = `Expo push request failed: ${String(err).slice(0, 200)}`;
      for (const m of batch) if (!rowOk.has(m.rowId)) rowErr.set(m.rowId, reason);
      console.error('[send-notifications]', reason);
      continue;
    }

    // Tickets come back in request order, one per message.
    batch.forEach((m, i) => {
      const ticket = tickets[i];
      if (!ticket) {
        if (!rowOk.has(m.rowId)) rowErr.set(m.rowId, 'Expo returned no ticket for this message.');
        return;
      }
      if (ticket.status === 'ok') {
        rowOk.add(m.rowId);
        rowErr.delete(m.rowId);
        return;
      }
      // The one error we act on structurally: the token is dead (app uninstalled
      // or the push credential was revoked). Disable it or we retry it forever.
      if (ticket.details?.error === 'DeviceNotRegistered') {
        deadTokens.add(m.token);
      }
      if (!rowOk.has(m.rowId)) {
        rowErr.set(m.rowId, (ticket.message ?? ticket.details?.error ?? 'unknown').slice(0, 300));
      }
    });
  }

  // Persist outcomes. Each is a single bulk statement, not one call per row.
  const sentIds = [...rowOk];
  const failedIds = [...rowErr.keys()].filter((id) => !rowOk.has(id));

  if (skipped.length > 0) {
    const { error } = await admin.rpc('mark_notifications_skipped', {
      p_ids: skipped,
      p_reason: 'preference off or no active device token',
    });
    if (error) console.error('[send-notifications] mark skipped failed', error.message);
  }

  if (sentIds.length > 0) {
    const { error } = await admin.rpc('mark_notifications_sent', { p_ids: sentIds });
    if (error) console.error('[send-notifications] mark sent failed', error.message);
  }

  if (failedIds.length > 0) {
    // One representative error for the batch; per-row detail is in the logs.
    const firstError = rowErr.get(failedIds[0]) ?? 'send failed';
    const { error } = await admin.rpc('mark_notifications_failed', {
      p_ids: failedIds,
      p_error: firstError,
      p_max_attempts: MAX_ATTEMPTS,
    });
    if (error) console.error('[send-notifications] mark failed failed', error.message);
  }

  let tokensDisabled = 0;
  if (deadTokens.size > 0) {
    const { data, error } = await admin.rpc('disable_push_tokens', { p_tokens: [...deadTokens] });
    if (error) console.error('[send-notifications] disable tokens failed', error.message);
    else tokensDisabled = typeof data === 'number' ? data : deadTokens.size;
  }

  return json(
    {
      claimed: rows.length,
      messages: outgoing.length,
      sent: sentIds.length,
      skipped: skipped.length,
      failed: failedIds.length,
      tokensDisabled,
    },
    200,
    req,
  );
});
