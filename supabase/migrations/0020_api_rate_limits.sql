-- Per-user rate limiting for the paid external-API surface.
--
-- Forward-only and ADDITIVE on top of 0001-0019. Closes the gap 0014 explicitly
-- left open ("this does NOT address per-day meal-count farming ... needs a rate
-- limit") and the wider one it did not name: BOTH edge functions that spend real
-- money (`chat` -> OpenAI, `estimate-meal` -> USDA + OpenAI) authenticate the
-- caller and then call out with NO ceiling of any kind. Signup is open, so
-- minting accounts is free, and one scripted account could previously drive
-- unbounded provider spend.
--
-- TRUST MODEL:
--   * consume_api_quotas() is SECURITY DEFINER and granted ONLY to service_role.
--     Edge functions run with the service role; the anon/authenticated client
--     can neither call it nor read/write api_usage. A client therefore cannot
--     inspect, reset, or pre-consume its own quota.
--   * The counter is incremented ATOMICALLY in the same statement that reads it
--     (insert .. on conflict do update .. returning), so two concurrent requests
--     cannot both observe "one left" and both proceed. This is the property a
--     read-then-write check would not have.
--   * Fail-CLOSED is the caller's decision, not the DB's: the function itself
--     always answers. See _shared/rateLimit.ts for how a transport failure is
--     handled (it denies).
--
-- ONE ROUND TRIP, NOT N:
--   Callers check several windows at once (a 60s burst window AND a 24h daily
--   window). The plural entry point takes parallel arrays and resolves ALL of
--   them in a single INSERT .. SELECT unnest(..) statement, so a two-window check
--   costs one network round trip and one statement, not two of each. This matters
--   because the check sits in front of every request on the hot path.
--
-- WINDOWING:
--   Windows are fixed (tumbling), not sliding: window_start is the epoch floored
--   to window_seconds. A fixed window can allow up to 2x the limit across a
--   boundary in the worst case. That is an accepted trade for a single-row,
--   index-only check; the burst window bounds the damage from it.
--
-- RETENTION:
--   Rows are disposable. prune_api_usage() drops anything older than 7 days and
--   is scheduled daily alongside the existing account purge (see 0010).

-- ===========================================================================
-- api_usage — one row per (user, bucket, window).
-- ===========================================================================
create table if not exists public.api_usage (
  user_id        uuid        not null references auth.users (id) on delete cascade,
  bucket         text        not null,
  window_start   timestamptz not null,
  window_seconds integer     not null,
  count          integer     not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (user_id, bucket, window_start, window_seconds),
  constraint api_usage_bucket_len check (char_length(bucket) between 1 and 64),
  constraint api_usage_count_nonneg check (count >= 0),
  constraint api_usage_window_positive check (window_seconds > 0)
);

-- Supports prune_api_usage()'s range delete. The PK already covers every lookup
-- the quota path performs, so no other index is warranted.
create index if not exists api_usage_window_start_idx
  on public.api_usage (window_start);

-- RLS on with NO policies at all: this mirrors food_search_cache (0003) —
-- every client role is denied, and the SECURITY DEFINER functions below are the
-- only access path. Enabling RLS without policies is deliberate, not an omission.
alter table public.api_usage enable row level security;

revoke all on public.api_usage from anon, authenticated;

comment on table public.api_usage is
  'Per-user rate limit counters for paid external-API calls. Service-role only; '
  'written exclusively by consume_api_quotas(). No client policies by design.';

-- ===========================================================================
-- consume_api_quotas — atomically count one use against N windows at once.
--
-- Returns one row per requested bucket. A bucket whose count has passed its
-- limit reports allowed=false; the caller must check and refuse the work itself.
-- The attempt is still recorded (count keeps climbing, saturating well below
-- int32 max) so sustained abuse stays visible in the table.
-- ===========================================================================
-- NOTE ON THE r_ PREFIXED OUT PARAMETERS:
--   plpgsql substitutes function parameter names for identifiers inside the
--   query body. Naming an OUT parameter `bucket` would collide with the
--   UNQUALIFIED `bucket` that the ON CONFLICT index-inference clause requires
--   (that clause must name the target table's columns and cannot be aliased).
--   Every OUT name is therefore prefixed so no identifier in the body is
--   ambiguous. The single-window wrapper below re-aliases them to clean names.
create or replace function public.consume_api_quotas(
  p_user_id        uuid,
  p_buckets        text[],
  p_limits         integer[],
  p_window_seconds integer[]
)
returns table (
  r_bucket   text,
  r_allowed  boolean,
  r_used     integer,
  r_limit    integer,
  r_reset_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    raise exception 'consume_api_quotas: p_user_id is required';
  end if;
  if p_buckets is null or array_length(p_buckets, 1) is null then
    raise exception 'consume_api_quotas: p_buckets must be non-empty';
  end if;
  if array_length(p_buckets, 1) <> array_length(p_limits, 1)
     or array_length(p_buckets, 1) <> array_length(p_window_seconds, 1) then
    raise exception 'consume_api_quotas: array arguments must be the same length';
  end if;

  return query
  -- MATERIALIZED so `prepared` is computed exactly once and both the INSERT and
  -- the final join observe byte-identical window_start values. (now() is already
  -- transaction-stable, so this is belt-and-braces rather than a correctness
  -- fix, but it also avoids recomputing the floor arithmetic twice.)
  with prepared as materialized (
    -- unnest(a, b, c) in FROM zips the arrays positionally. Multiple unnest()
    -- calls in a SELECT list would instead pad to the longest array.
    -- distinct on IS REQUIRED: ON CONFLICT DO UPDATE raises "cannot affect row
    -- a second time" if the same bucket appears twice in one statement.
    select distinct on (t.bucket)
      t.bucket             as p_bucket,
      greatest(t.lim, 0)   as p_lim,
      greatest(t.win, 1)   as p_win,
      to_timestamp(
        floor(extract(epoch from now()) / greatest(t.win, 1)) * greatest(t.win, 1)
      ) as p_window_start
    from unnest(p_buckets, p_limits, p_window_seconds) as t(bucket, lim, win)
    order by t.bucket
  ),
  upserted as (
    insert into public.api_usage as u (user_id, bucket, window_start, window_seconds, count, updated_at)
    select p_user_id, pr.p_bucket, pr.p_window_start, pr.p_win, 1, now()
    from prepared pr
    on conflict (user_id, bucket, window_start, window_seconds)
    -- Saturate rather than overflow: a hostile client hammering an already
    -- denied bucket must never push this integer past its range.
    do update set count = least(u.count + 1, 2000000000), updated_at = now()
    returning u.bucket as u_bucket, u.window_start as u_window_start,
              u.window_seconds as u_window_seconds, u.count as u_count
  )
  select
    up.u_bucket,
    up.u_count <= pr.p_lim,
    up.u_count,
    pr.p_lim,
    up.u_window_start + make_interval(secs => up.u_window_seconds)
  from upserted up
  join prepared pr on pr.p_bucket = up.u_bucket;
end;
$$;

-- ===========================================================================
-- consume_api_quota — single-window convenience wrapper. Delegates so there is
-- exactly one implementation of the counting logic.
-- ===========================================================================
create or replace function public.consume_api_quota(
  p_user_id        uuid,
  p_bucket         text,
  p_limit          integer,
  p_window_seconds integer
)
returns table (allowed boolean, used integer, quota_limit integer, reset_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
as $$
  select q.r_allowed, q.r_used, q.r_limit, q.r_reset_at
  from public.consume_api_quotas(
    p_user_id, array[p_bucket], array[p_limit], array[p_window_seconds]
  ) q;
$$;

-- Service role only. Explicitly revoked from every client-reachable role so a
-- user cannot burn or probe their own quota directly.
revoke all on function public.consume_api_quotas(uuid, text[], integer[], integer[]) from public;
revoke all on function public.consume_api_quotas(uuid, text[], integer[], integer[]) from anon, authenticated;
grant execute on function public.consume_api_quotas(uuid, text[], integer[], integer[]) to service_role;

revoke all on function public.consume_api_quota(uuid, text, integer, integer) from public;
revoke all on function public.consume_api_quota(uuid, text, integer, integer) from anon, authenticated;
grant execute on function public.consume_api_quota(uuid, text, integer, integer) to service_role;

comment on function public.consume_api_quotas(uuid, text[], integer[], integer[]) is
  'Atomically consume one unit against N per-user fixed-window quotas in a single '
  'statement. Service-role only; called by the chat and estimate-meal edge '
  'functions before any paid external API call.';

-- ===========================================================================
-- prune_api_usage — drop expired counters. Scheduled daily.
-- ===========================================================================
create or replace function public.prune_api_usage()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.api_usage where window_start < now() - interval '7 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_api_usage() from public;
revoke all on function public.prune_api_usage() from anon, authenticated;
grant execute on function public.prune_api_usage() to service_role;

-- cron.schedule upserts by job name (same idiom as 0010), so re-running this
-- migration is idempotent. Guarded so it still applies on a local stack without
-- pg_cron installed.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('prune-api-usage', '30 4 * * *', 'select public.prune_api_usage();');
  end if;
end;
$$;
