// `account-lifecycle` edge function.
//
// The in-app entry point for soft account deletion + recovery. It runs server-side
// for two reasons the client cannot satisfy:
//   1. It calls the SECURITY DEFINER RPCs (request_account_deletion /
//      reactivate_account) AS THE AUTHENTICATED USER, so auth.uid() is trusted and
//      the user can only ever act on their OWN account.
//   2. It sends the heads-up email (a real owner whose password was stolen needs to
//      be told their account is scheduled for deletion). Email goes through an
//      external provider, which a Postgres RPC cannot reach.
//
// It NEVER hard-deletes anything. Permanent deletion happens only after the grace
// window, in the separate `purge-accounts` function.
//
// Body: { "action": "deactivate" | "reactivate" }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeadersFor, preflightResponse, rejectDisallowedOrigin } from '../_shared/cors.ts';
import { consumeQuotas, rateLimitedResponse } from '../_shared/rateLimit.ts';

/**
 * Best-effort transactional email. Only sends when RESEND_API_KEY is configured;
 * otherwise it logs and returns so the lifecycle action still succeeds. Failures
 * are swallowed — a missing notification must never block deletion/recovery.
 */
async function notify(to: string, subject: string, html: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('ACCOUNT_EMAIL_FROM') ?? 'MacroLeague <noreply@macroleague.app>';
  if (!apiKey) {
    console.log('[account-lifecycle] email skipped (RESEND_API_KEY not set):', subject);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      console.error('[account-lifecycle] email send failed', res.status);
    }
  } catch (err) {
    console.error('[account-lifecycle] email error', (err as Error)?.name ?? 'error');
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return preflightResponse(req);
  }
  // This endpoint deactivates and reactivates accounts. Refuse a cross-origin
  // caller outright rather than merely hiding the response from it.
  const originRejection = rejectDisallowedOrigin(req);
  if (originRejection) return originRejection;
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    return json({ error: 'Server is missing Supabase configuration.' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!/^Bearer\s+/i.test(authHeader)) {
    return json({ error: 'Not authenticated.' }, 401);
  }

  // A USER-scoped client: every query/RPC runs with the caller's JWT, so the RPCs'
  // auth.uid() resolves to this user and RLS applies. We never use the service role
  // here — this function only ever touches the caller's own account.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: 'Not authenticated.' }, 401);
  }
  const email = userData.user.email ?? null;

  // Rate-limit BEFORE any account action — each deactivate/reactivate fires a
  // real Resend email, so an unbounded loop burns email budget and, worse, can
  // torch the sending domain's reputation for every user. The quota RPC
  // (0020) is service-role only, so use a service-role client purely for that
  // check; the lifecycle RPCs stay on the user-scoped client above.
  // Fail-closed: consumeQuotas denies if the check itself errors.
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceRoleKey) {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const quota = await consumeQuotas(admin, userData.user.id, [
      { bucket: 'lifecycle:daily', limit: 5, windowSeconds: 86400, label: 'account changes today' },
      { bucket: 'lifecycle:burst', limit: 3, windowSeconds: 60, label: 'account changes this minute' },
    ]);
    if (!quota.allowed) return rateLimitedResponse(quota, corsHeaders);
  }

  let payload: { action?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }
  const action = payload.action;

  if (action === 'deactivate') {
    const { data, error } = await userClient.rpc('request_account_deletion');
    if (error) {
      // Log the real cause server-side; never forward raw Postgres/RPC text
      // (constraint names, function internals) to the client.
      console.error('[account-lifecycle] deactivate failed:', error.message);
      return json({ error: 'Could not deactivate your account. Please try again.' }, 400);
    }
    const scheduledAt = data as string; // timestamptz ISO string
    if (email) {
      const when = new Date(scheduledAt).toUTCString();
      await notify(
        email,
        'Your MacroLeague account is scheduled for deletion',
        `<p>We received a request to delete your MacroLeague account.</p>
         <p>Your account is now deactivated and will be <strong>permanently deleted on ${when}</strong>.</p>
         <p>Changed your mind, or didn't request this? Just sign back in before then and tap
         <strong>Reactivate my account</strong> — everything will be exactly as you left it.
         If you didn't request this, we recommend resetting your password.</p>`,
      );
    }
    return json({ status: 'deactivated', deletionScheduledAt: scheduledAt });
  }

  if (action === 'reactivate') {
    const { error } = await userClient.rpc('reactivate_account');
    if (error) {
      console.error('[account-lifecycle] reactivate failed:', error.message);
      return json({ error: 'Could not reactivate your account. Please try again.' }, 400);
    }
    if (email) {
      await notify(
        email,
        'Welcome back to MacroLeague',
        `<p>Your account has been reactivated and the scheduled deletion was cancelled. Welcome back!</p>`,
      );
    }
    return json({ status: 'active' });
  }

  return json({ error: 'Unknown action. Use "deactivate" or "reactivate".' }, 400);
});
