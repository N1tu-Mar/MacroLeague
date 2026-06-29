-- Schedule the permanent account purge.
--
-- Forward-only and ADDITIVE on top of 0001-0009. Migration 0009 added the
-- soft-delete state (profiles.deactivated_at / deletion_scheduled_at) and the
-- `purge-accounts` edge function permanently deletes accounts whose 14-day
-- recovery window has elapsed. That function is NOT user-facing — it must be
-- driven on a schedule. This migration creates that schedule with pg_cron, which
-- calls the function over HTTP via pg_net once a day.
--
-- ===========================================================================
-- MANUAL PREREQUISITES (not in this migration, because they hold secret values)
-- ===========================================================================
-- These are set once per environment and are intentionally kept OUT of git:
--   1. The edge-function secret the function validates the inbound header against:
--        npx supabase secrets set ACCOUNT_PURGE_SECRET=<random-32-byte-hex>
--   2. Two Vault secrets this job reads at runtime (so no secret is hardcoded in
--      cron.job.command or in this file):
--        account_purge_secret  -> the SAME value as ACCOUNT_PURGE_SECRET above
--        project_anon_key      -> the project's public anon key (gateway apikey)
--      e.g.  select vault.create_secret('<value>', 'account_purge_secret', '...');
-- On the live project (ref zenwxynwkcbwmfedkixg) all three are already set.
-- A fresh environment must set them or the scheduled call will be rejected (403)
-- by the function and no purge will occur — fail-closed, never fail-open.
-- ===========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- cron.schedule upserts by job name, so re-running this migration is idempotent.
-- Runs daily at 04:00 UTC. The function itself re-checks the recovery window and
-- only deletes accounts whose deletion_scheduled_at has passed, so an extra run
-- is harmless. Secrets are read from Vault at fire time, not baked into the job.
select cron.schedule(
  'purge-expired-accounts',
  '0 4 * * *',
  $job$
  select net.http_post(
    url     := 'https://zenwxynwkcbwmfedkixg.supabase.co/functions/v1/purge-accounts',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        (select decrypted_secret from vault.decrypted_secrets where name = 'project_anon_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'project_anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'account_purge_secret')
    ),
    body    := '{}'::jsonb
  );
  $job$
);
