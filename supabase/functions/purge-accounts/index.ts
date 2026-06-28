// `purge-accounts` edge function.
//
// The ONLY place that permanently deletes a user. It is NOT user-facing: a daily
// schedule invokes it with a shared secret. It finds accounts whose recovery
// window has passed and deletes the underlying auth user via the admin API.
// Because every personal table FKs profiles/auth.users with ON DELETE CASCADE
// (foods.created_by is SET NULL), deleting the auth user removes all of that user's
// rows while leaving the shared USDA food cache intact.
//
// Protected by a secret header instead of a user JWT (verify_jwt = false in
// config.toml), so it can be driven by pg_cron / an external scheduler but not by
// random callers.
//
// Trigger header:  x-cron-secret: <ACCOUNT_PURGE_SECRET>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const BATCH_LIMIT = 200;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const purgeSecret = Deno.env.get('ACCOUNT_PURGE_SECRET');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Server is missing Supabase configuration.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // Refuse to run if the secret is not configured, so a misconfiguration can never
  // leave the destructive endpoint open.
  if (!purgeSecret || req.headers.get('x-cron-secret') !== purgeSecret) {
    return new Response(JSON.stringify({ error: 'Forbidden.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find archived accounts whose recovery window has elapsed.
  const { data: due, error: dueError } = await admin
    .from('profiles')
    .select('id')
    .not('deletion_scheduled_at', 'is', null)
    .lte('deletion_scheduled_at', new Date().toISOString())
    .limit(BATCH_LIMIT);

  if (dueError) {
    return new Response(JSON.stringify({ error: dueError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let purged = 0;
  const failures: string[] = [];
  for (const row of due ?? []) {
    const id = row.id as string;
    // Deleting the auth user cascades to profiles and every personal table.
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      failures.push(id);
      console.error('[purge-accounts] deleteUser failed', id, error.message);
    } else {
      purged += 1;
    }
  }

  return new Response(JSON.stringify({ purged, failed: failures.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
