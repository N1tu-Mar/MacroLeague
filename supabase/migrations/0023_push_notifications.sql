-- Real push notifications: device tokens, per-user preferences, an auditable
-- send queue, and the daily jobs that fill it.
--
-- Forward-only and ADDITIVE on top of 0001-0022. It never edits earlier
-- migrations. It closes the largest remaining retention gap in the app: the
-- Notifications settings screen wrote five switches to AsyncStorage and nothing
-- else. There was no device token, no permission request, no sender, and no
-- schedule — every switch was decorative, and the streak reminder (the single
-- highest-leverage message a streak-based app can send) did not exist at all.
--
-- WHY A SEPARATE notification_preferences TABLE, NOT COLUMNS ON profiles:
--   profiles is the app's hottest read: the leaderboard RPCs, get_challenge_
--   standings, the friend RPCs and the social feed all join or scan it, and
--   several of those paths deliberately return other users' profile rows. Push
--   preferences are (a) written from a settings screen almost never, (b) read
--   only by the service-role sender, and (c) nobody else's business. Putting
--   them on profiles would widen every one of those hot reads and would place a
--   private per-user setting behind the same read policies that intentionally
--   expose profiles to other members. A separate 1:1 table keeps preferences
--   owner-only by construction (RLS `id = auth.uid()`, no cross-user policy at
--   all), and keeps profiles narrow. The 1:1 join costs the sender one extra
--   scan per run, once a day.
--
-- TRUST MODEL (mirrors 0019/0020):
--   * NOTHING here is client-writable through the table APIs. push_tokens,
--     notification_preferences and notification_queue each have RLS enabled with
--     read-own policies only — there is no insert/update/delete policy for
--     anon or authenticated on any of them. Every legitimate client write goes
--     through a SECURITY DEFINER RPC that hard-scopes itself to auth.uid():
--       register_push_token(), disable_push_token(), update_notification_preferences().
--     A client therefore cannot register a token against ANOTHER user's id, and
--     cannot flip another user's preferences, even with a forged payload — the
--     user id is never a parameter, it is read from the JWT inside the function.
--   * The queue is entirely backend-owned. Clients can read their own queued
--     rows (useful for support and for an in-app history later) but cannot
--     insert, claim, or mark them. claim_notification_batch() and
--     mark_notification_sent/failed() are granted to service_role ONLY, so the
--     edge function is the sole writer.
--   * The sender re-checks preferences at SEND time, not just at ENQUEUE time.
--     A user who turns streak reminders off after a row is queued but before the
--     nightly send must not receive it. Both the enqueue job and the edge
--     function apply the preference filter; the send-time check is the one that
--     is authoritative.
--
-- DELIBERATE, DOCUMENTED SEMANTICS:
--   * LOCAL DAYS, NOT UTC DAYS. Same convention as 0006, which stamps every
--     gamification_events row with a local date derived from profiles.timezone
--     (default 'America/New_York'). "Has not logged today" is evaluated against
--     (now() at time zone p.timezone)::date and compared to
--     user_daily_activity.activity_date, which 0006 already writes in exactly
--     that local frame. A UTC comparison would tell an East-Coast user at 9pm
--     that they had not logged, or skip them entirely after midnight UTC.
--   * ONE STREAK REMINDER PER USER PER LOCAL DAY, guaranteed structurally by the
--     unique index on notification_queue.dedupe_key, whose value is
--     'streak_reminder:<user>:<local date>'. The enqueue function can be run ten
--     times an hour and will still produce exactly one row per user per day.
--     Challenge reminders add the challenge id as a fourth key segment, so a
--     user in three ending challenges gets three distinct rows and still no
--     duplicates. This mirrors src/lib/pushNotifications.ts buildDedupeKey(),
--     which is unit tested; the index here is the actual guarantee.
--   * THE ENQUEUE JOB RUNS HOURLY, THE SEND FOLLOWS IT. A single daily UTC run
--     cannot hit "evening" for users in different timezones. The job runs every
--     hour and selects only users whose LOCAL hour is currently the reminder
--     hour (19:00). Each user is therefore nudged at 7pm their own time, and the
--     per-local-day dedupe key means the other 23 runs add nothing for them.
--   * FAIL-CLOSED SENDER. The edge function refuses to run without its shared
--     secret (same posture as purge-accounts / 0010). A misconfigured
--     environment sends nothing; it never sends to everyone.
--   * A QUEUE, NOT A FIRE-AND-FORGET SEND. Every intended notification is a row
--     with a status, an attempt count and an error. A send is therefore
--     auditable ("did we actually nudge this user?") and retryable (a failed row
--     goes back to 'pending' until max attempts), which a direct push from a
--     trigger would not be.
--
-- ===========================================================================
-- MANUAL PREREQUISITES (kept OUT of git, they hold secret values)
-- ===========================================================================
--   1. The edge-function secret the sender validates the inbound header against:
--        npx supabase secrets set PUSH_NOTIFICATIONS_SECRET=<random-32-byte-hex>
--   2. Two Vault secrets the cron job reads at fire time (never hardcoded here):
--        push_notifications_secret -> the SAME value as PUSH_NOTIFICATIONS_SECRET
--        project_anon_key          -> already created for 0010; reused as-is
--      e.g. select vault.create_secret('<value>', 'push_notifications_secret', '...');
--   3. Push credentials, which live outside Supabase entirely: an APNs key for
--      iOS and an FCM v1 service account for Android, uploaded to EAS
--      (`eas credentials`). Without them Expo accepts tokens and rejects sends.
-- If any of these is missing the schedule still fires, the function returns 403
-- (or Expo rejects the batch) and rows stay queued — fail-closed, never
-- fail-open, and never a silent double send.
-- ===========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ===========================================================================
-- 1. push_tokens — one row per (user, device token).
-- ===========================================================================
-- expo_push_token is globally unique, not unique per user: a physical device
-- yields ONE Expo token, and if that device is handed to a different account the
-- token must MOVE, not be duplicated. A globally unique token plus an upsert
-- that rewrites user_id is what stops the previous owner from receiving the new
-- owner's notifications.
create table if not exists public.push_tokens (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles (id) on delete cascade,
  expo_push_token text        not null,
  platform        text        not null default 'unknown',
  device_id       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  -- Non-null once the token is known dead (Expo DeviceNotRegistered) or the user
  -- signed out on that device. Rows are retained rather than deleted so a
  -- re-register is an update and the history of a device stays inspectable.
  disabled_at     timestamptz,
  constraint push_tokens_token_shape check (
    expo_push_token ~ '^Expo(nent)?PushToken\[[^][:space:]]+\]$'
  ),
  constraint push_tokens_platform_check check (platform in ('ios', 'android', 'web', 'unknown')),
  constraint push_tokens_device_id_len check (device_id is null or char_length(device_id) <= 128)
);

-- THE dedupe guarantee for tokens. Also the conflict target for the upsert.
create unique index if not exists push_tokens_expo_token_unique
  on public.push_tokens (expo_push_token);

-- The sender's hot path: "every live token for this user".
create index if not exists push_tokens_user_active_idx
  on public.push_tokens (user_id)
  where disabled_at is null;

comment on table public.push_tokens is
  'Expo push tokens, one row per device. Backend/RPC-owned: no client insert/update policy exists — register_push_token() (SECURITY DEFINER) is the only client write path and always uses auth.uid(). A token is globally unique so handing a device to another account MOVES the token instead of duplicating it.';

comment on column public.push_tokens.disabled_at is
  'Set when Expo reports DeviceNotRegistered (app uninstalled / credential revoked) or the user signs out on that device. Disabled rows are skipped by the sender but kept for audit.';

alter table public.push_tokens enable row level security;

-- Read-own only. There is deliberately NO insert/update/delete policy: writes go
-- through the SECURITY DEFINER functions below.
drop policy if exists "read own push tokens" on public.push_tokens;
create policy "read own push tokens" on public.push_tokens
  for select using (auth.uid() = user_id);

-- ===========================================================================
-- 2. notification_preferences — one row per user. See header for why not profiles.
-- ===========================================================================
create table if not exists public.notification_preferences (
  user_id            uuid        primary key references public.profiles (id) on delete cascade,
  streak_reminders   boolean     not null default true,
  challenge_updates  boolean     not null default true,
  friend_activity    boolean     not null default true,
  -- The one default-OFF flag: the weekly report is informational rather than
  -- retention-critical, so it is opt-in. Mirrors
  -- DEFAULT_NOTIFICATION_PREFERENCES in src/lib/pushNotifications.ts.
  weekly_report      boolean     not null default false,
  rewards            boolean     not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.notification_preferences is
  'Per-user push opt-ins, 1:1 with profiles. Kept off profiles so a private setting is not carried by the leaderboard/standings/social reads that intentionally expose other users profile rows. Read-own via RLS; written only by update_notification_preferences().';

alter table public.notification_preferences enable row level security;

drop policy if exists "read own notification preferences" on public.notification_preferences;
create policy "read own notification preferences" on public.notification_preferences
  for select using (auth.uid() = user_id);

-- Backfill every existing account so the sender never has to reason about a
-- missing row. New accounts are covered by the trigger below.
insert into public.notification_preferences (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- Give every future account its defaults at profile-creation time, the same way
-- 0017 gives every account a default avatar.
create or replace function public.ensure_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_ensure_notification_preferences on public.profiles;
create trigger profiles_ensure_notification_preferences
  after insert on public.profiles
  for each row execute function public.ensure_notification_preferences();

-- ===========================================================================
-- 3. notification_queue — every intended send, as an auditable, retryable row.
-- ===========================================================================
create table if not exists public.notification_queue (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles (id) on delete cascade,
  kind          text        not null,
  title         text        not null,
  body          text        not null,
  -- Free-form payload delivered to the app (deep-link target, ids, counts).
  data          jsonb       not null default '{}'::jsonb,
  -- '<kind>:<user>:<local date>[:<subject>]'. THE once-per-user-per-day
  -- guarantee, enforced by the unique index below.
  dedupe_key    text        not null,
  status        text        not null default 'pending',
  attempts      integer     not null default 0,
  -- Set while a sender run owns the row, so two overlapping runs cannot both
  -- send it (see claim_notification_batch's `for update skip locked`).
  claimed_at    timestamptz,
  sent_at       timestamptz,
  last_error    text,
  scheduled_for timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint notification_queue_kind_check check (
    kind in ('streak_reminder', 'challenge_update', 'friend_activity', 'weekly_report', 'reward')
  ),
  constraint notification_queue_status_check check (
    status in ('pending', 'claimed', 'sent', 'failed', 'skipped')
  ),
  constraint notification_queue_title_len check (char_length(title) between 1 and 120),
  constraint notification_queue_body_len check (char_length(body) between 1 and 400),
  constraint notification_queue_dedupe_len check (char_length(dedupe_key) between 1 and 200),
  constraint notification_queue_attempts_nonneg check (attempts >= 0)
);

-- THE dedupe guarantee. Global (not per-status) on purpose: once a reminder for
-- a user/day exists in ANY state — pending, sent, even failed — re-running the
-- enqueue job must not create a second one. A user cannot be nudged twice for
-- the same day by a retry, a manual run, or two overlapping cron ticks.
create unique index if not exists notification_queue_dedupe_unique
  on public.notification_queue (dedupe_key);

-- The claim path: oldest due, still-pending rows first.
create index if not exists notification_queue_pending_idx
  on public.notification_queue (scheduled_for)
  where status = 'pending';

comment on table public.notification_queue is
  'Every intended push, queued so a send is auditable and retryable. Backend-owned: clients may read their own rows but there is no client insert/update policy — enqueue is done by SECURITY DEFINER jobs and claim/mark only by service_role.';

comment on column public.notification_queue.dedupe_key is
  'Unique across ALL statuses. ''<kind>:<user_id>:<local date>[:<subject>]''. Matches buildDedupeKey() in src/lib/pushNotifications.ts.';

comment on column public.notification_queue.status is
  'pending -> claimed -> sent | failed. ''skipped'' means the user''s preference (re-checked at send time) forbade it, recorded rather than deleted so an unsent notification is still explainable.';

alter table public.notification_queue enable row level security;

drop policy if exists "read own queued notifications" on public.notification_queue;
create policy "read own queued notifications" on public.notification_queue
  for select using (auth.uid() = user_id);

-- ===========================================================================
-- 4. Client-facing RPCs. SECURITY DEFINER, hard-scoped to auth.uid().
-- ===========================================================================

-- register_push_token — upsert this device's token for the CALLER.
--
-- The user id is NOT a parameter: it comes from the JWT, so a client cannot
-- register a token against someone else's account. Conflict target is the token
-- itself, so re-registering after a reinstall (or on a device that changed
-- hands) updates the existing row — including moving user_id — rather than
-- leaving a stale row that would push the wrong person's data to that device.
create or replace function public.register_push_token(
  p_token     text,
  p_platform  text default 'unknown',
  p_device_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_id      uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[^][:space:]]+\]$' then
    raise exception 'Invalid Expo push token.' using errcode = '22023';
  end if;

  insert into public.push_tokens (user_id, expo_push_token, platform, device_id)
  values (
    v_user_id,
    p_token,
    case when p_platform in ('ios', 'android', 'web') then p_platform else 'unknown' end,
    nullif(left(coalesce(p_device_id, ''), 128), '')
  )
  on conflict (expo_push_token) do update
    set user_id      = excluded.user_id,
        platform     = excluded.platform,
        device_id    = coalesce(excluded.device_id, public.push_tokens.device_id),
        updated_at   = now(),
        last_seen_at = now(),
        -- Re-registering revives a token previously disabled by an uninstall.
        disabled_at  = null
  returning id into v_id;

  -- Registering implies the account exists but may predate the trigger above.
  insert into public.notification_preferences (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  return v_id;
end;
$$;

revoke all on function public.register_push_token(text, text, text) from public;
grant execute on function public.register_push_token(text, text, text) to authenticated;

-- disable_push_token — called on sign-out so a shared device stops receiving the
-- previous user's notifications. Scoped to the caller's own rows: passing
-- someone else's token is a no-op, not an error, so it cannot be used to probe
-- which tokens exist.
create or replace function public.disable_push_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_hit     integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  update public.push_tokens
     set disabled_at = now(), updated_at = now()
   where user_id = v_user_id
     and expo_push_token = p_token
     and disabled_at is null;

  get diagnostics v_hit = row_count;
  return v_hit > 0;
end;
$$;

revoke all on function public.disable_push_token(text) from public;
grant execute on function public.disable_push_token(text) to authenticated;

-- get_notification_preferences — the caller's own row, creating it on first read
-- so the settings screen never has to handle a missing row.
create or replace function public.get_notification_preferences()
returns public.notification_preferences
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row     public.notification_preferences;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  insert into public.notification_preferences (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select * into v_row from public.notification_preferences where user_id = v_user_id;
  return v_row;
end;
$$;

revoke all on function public.get_notification_preferences() from public;
grant execute on function public.get_notification_preferences() to authenticated;

-- update_notification_preferences — partial update of the CALLER's own row.
--
-- Every parameter is nullable and null means "leave unchanged", so the settings
-- screen can flip one switch without racing the other four. Again, no user id
-- parameter: the row is chosen by auth.uid().
create or replace function public.update_notification_preferences(
  p_streak_reminders  boolean default null,
  p_challenge_updates boolean default null,
  p_friend_activity   boolean default null,
  p_weekly_report     boolean default null,
  p_rewards           boolean default null
)
returns public.notification_preferences
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row     public.notification_preferences;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  insert into public.notification_preferences (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  update public.notification_preferences
     set streak_reminders  = coalesce(p_streak_reminders,  streak_reminders),
         challenge_updates = coalesce(p_challenge_updates, challenge_updates),
         friend_activity   = coalesce(p_friend_activity,   friend_activity),
         weekly_report     = coalesce(p_weekly_report,     weekly_report),
         rewards           = coalesce(p_rewards,           rewards),
         updated_at        = now()
   where user_id = v_user_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.update_notification_preferences(boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function public.update_notification_preferences(boolean, boolean, boolean, boolean, boolean) to authenticated;

-- ===========================================================================
-- 5. Service-role-only functions: the sender's claim / mark cycle.
-- ===========================================================================

-- claim_notification_batch — atomically take up to p_limit due rows.
--
-- `for update skip locked` is what makes overlapping sender runs safe: a second
-- run steps over rows the first already holds instead of blocking on them or,
-- worse, sending them again. The status flip to 'claimed' happens in the SAME
-- statement that selects, so there is no read-then-write window.
--
-- The user's live tokens and current preferences are returned alongside each
-- row, so the sender needs exactly one round trip per batch and applies the
-- send-time preference check (see header) without a second query.
create or replace function public.claim_notification_batch(p_limit integer default 100)
returns table (
  id            uuid,
  user_id       uuid,
  kind          text,
  title         text,
  body          text,
  data          jsonb,
  attempts      integer,
  tokens        text[],
  preference_on boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with claimed as (
    update public.notification_queue q
       set status     = 'claimed',
           claimed_at = now(),
           attempts   = q.attempts + 1
     where q.id in (
       select c.id
         from public.notification_queue c
        where c.status = 'pending'
          and c.scheduled_for <= now()
        order by c.scheduled_for
        limit greatest(1, least(coalesce(p_limit, 100), 500))
        for update skip locked
     )
    returning q.id, q.user_id, q.kind, q.title, q.body, q.data, q.attempts
  )
  select
    c.id,
    c.user_id,
    c.kind,
    c.title,
    c.body,
    c.data,
    c.attempts,
    coalesce(
      (select array_agg(t.expo_push_token)
         from public.push_tokens t
        where t.user_id = c.user_id and t.disabled_at is null),
      '{}'::text[]
    ) as tokens,
    -- Authoritative, send-time preference check. A user who switched a kind off
    -- after this row was queued is respected here.
    coalesce(
      case c.kind
        when 'streak_reminder'  then p.streak_reminders
        when 'challenge_update' then p.challenge_updates
        when 'friend_activity'  then p.friend_activity
        when 'weekly_report'    then p.weekly_report
        when 'reward'           then p.rewards
      end,
      false
    ) as preference_on
  from claimed c
  left join public.notification_preferences p on p.user_id = c.user_id;
end;
$$;

revoke all on function public.claim_notification_batch(integer) from public;
revoke all on function public.claim_notification_batch(integer) from anon, authenticated;
grant execute on function public.claim_notification_batch(integer) to service_role;

-- mark_notifications_sent / _failed / _skipped — terminal transitions, applied in
-- bulk (one statement per outcome, not one per notification).
create or replace function public.mark_notifications_sent(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  update public.notification_queue
     set status = 'sent', sent_at = now(), last_error = null
   where id = any(coalesce(p_ids, '{}'::uuid[]));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_notifications_sent(uuid[]) from public;
revoke all on function public.mark_notifications_sent(uuid[]) from anon, authenticated;
grant execute on function public.mark_notifications_sent(uuid[]) to service_role;

-- A failure below the attempt ceiling goes BACK to 'pending' so the next run
-- retries it; at or above the ceiling it stays 'failed' and is never retried
-- again. Without the ceiling a permanently broken row would be re-sent forever.
create or replace function public.mark_notifications_failed(
  p_ids          uuid[],
  p_error        text default null,
  p_max_attempts integer default 3
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  update public.notification_queue
     set status     = case when attempts >= greatest(1, coalesce(p_max_attempts, 3))
                           then 'failed' else 'pending' end,
         claimed_at = null,
         last_error = left(coalesce(p_error, 'unknown error'), 500)
   where id = any(coalesce(p_ids, '{}'::uuid[]));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_notifications_failed(uuid[], text, integer) from public;
revoke all on function public.mark_notifications_failed(uuid[], text, integer) from anon, authenticated;
grant execute on function public.mark_notifications_failed(uuid[], text, integer) to service_role;

-- 'skipped' is terminal and NOT a failure: the user opted out, or has no live
-- token. Recorded rather than deleted so "why didn't I get it?" is answerable.
create or replace function public.mark_notifications_skipped(p_ids uuid[], p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  update public.notification_queue
     set status = 'skipped', last_error = left(coalesce(p_reason, 'skipped'), 500)
   where id = any(coalesce(p_ids, '{}'::uuid[]));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_notifications_skipped(uuid[], text) from public;
revoke all on function public.mark_notifications_skipped(uuid[], text) from anon, authenticated;
grant execute on function public.mark_notifications_skipped(uuid[], text) to service_role;

-- disable_push_tokens — the sender's response to Expo's DeviceNotRegistered.
-- Not the same as the client's disable_push_token(): this one is not scoped to a
-- caller (there is no user), so it is service_role-only.
create or replace function public.disable_push_tokens(p_tokens text[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  update public.push_tokens
     set disabled_at = now(), updated_at = now()
   where expo_push_token = any(coalesce(p_tokens, '{}'::text[]))
     and disabled_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.disable_push_tokens(text[]) from public;
revoke all on function public.disable_push_tokens(text[]) from anon, authenticated;
grant execute on function public.disable_push_tokens(text[]) to service_role;

-- ===========================================================================
-- 6. The enqueue jobs. Local-day aware; idempotent by dedupe key.
-- ===========================================================================

-- enqueue_streak_reminders — one nudge per user per LOCAL day, at 7pm local.
--
-- Selection rules, all deliberate:
--   * Local hour = p_local_hour (default 19). This is why the job runs hourly:
--     it is the only way to hit "evening" for every timezone from one schedule.
--   * The user must have a live push token AND streak_reminders on. Queuing a
--     row for a user with no device is pure noise in the audit trail.
--   * The user must have NO user_daily_activity row for their own local date —
--     the exact table and local-date frame 0006's award trigger writes. That is
--     the whole point: "has not logged today" in THEIR day, not UTC's.
--   * Soft-deleted accounts (0009) are excluded; nudging someone who asked to be
--     deleted is the worst possible message to send.
--   * `on conflict (dedupe_key) do nothing` makes a re-run a no-op.
create or replace function public.enqueue_streak_reminders(p_local_hour integer default 19)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  insert into public.notification_queue (user_id, kind, title, body, data, dedupe_key)
  select
    p.id,
    'streak_reminder',
    case when coalesce(p.streak_count, 0) > 0
         then 'Keep your ' || p.streak_count || '-day streak alive'
         else 'Log a meal to start a streak' end,
    case when coalesce(p.streak_count, 0) > 0
         then 'You haven''t logged today. One meal secures the streak.'
         else 'Log your first meal of the day and get on the board.' end,
    jsonb_build_object(
      'streak', coalesce(p.streak_count, 0),
      'local_date', (now() at time zone coalesce(p.timezone, 'America/New_York'))::date,
      'target', 'log'
    ),
    'streak_reminder:' || p.id || ':' ||
      (now() at time zone coalesce(p.timezone, 'America/New_York'))::date
  from public.profiles p
  join public.notification_preferences np on np.user_id = p.id
  where np.streak_reminders
    and p.deactivated_at is null
    -- LOCAL evening for this specific user.
    and extract(hour from (now() at time zone coalesce(p.timezone, 'America/New_York')))
        = greatest(0, least(coalesce(p_local_hour, 19), 23))
    and exists (
      select 1 from public.push_tokens t
       where t.user_id = p.id and t.disabled_at is null
    )
    and not exists (
      select 1 from public.user_daily_activity a
       where a.user_id = p.id
         and a.activity_date = (now() at time zone coalesce(p.timezone, 'America/New_York'))::date
    )
  on conflict (dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.enqueue_streak_reminders(integer) from public;
revoke all on function public.enqueue_streak_reminders(integer) from anon, authenticated;
grant execute on function public.enqueue_streak_reminders(integer) to service_role;

-- enqueue_challenge_ending_reminders — nudge active participants when a
-- challenge they are in ends within p_days_ahead days.
--
-- The dedupe key carries the challenge id, so a user in three ending challenges
-- gets three rows (one each) and still cannot get the same one twice in a day.
-- Finalized challenges (0019) are excluded — a settled result needs no nudge.
create or replace function public.enqueue_challenge_ending_reminders(
  p_local_hour  integer default 18,
  p_days_ahead  integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  insert into public.notification_queue (user_id, kind, title, body, data, dedupe_key)
  select
    p.id,
    'challenge_update',
    case when c.end_date <= (now() at time zone coalesce(p.timezone, 'America/New_York'))::date
         then left(c.name, 80) || ' ends today'
         else left(c.name, 80) || ' ends in ' ||
              (c.end_date - (now() at time zone coalesce(p.timezone, 'America/New_York'))::date) ||
              ' day' ||
              case when (c.end_date - (now() at time zone coalesce(p.timezone, 'America/New_York'))::date) = 1
                   then '' else 's' end
    end,
    'Log now to move up the standings before it closes.',
    jsonb_build_object(
      'challenge_id', c.id,
      'challenge_name', c.name,
      'days_left', greatest(0, c.end_date - (now() at time zone coalesce(p.timezone, 'America/New_York'))::date),
      'target', 'challenge'
    ),
    'challenge_update:' || p.id || ':' ||
      (now() at time zone coalesce(p.timezone, 'America/New_York'))::date || ':' || c.id
  from public.challenge_participants cp
  join public.challenges c on c.id = cp.challenge_id
  join public.profiles p on p.id = cp.user_id
  join public.notification_preferences np on np.user_id = p.id
  where np.challenge_updates
    and p.deactivated_at is null
    and c.finalized_at is null
    and extract(hour from (now() at time zone coalesce(p.timezone, 'America/New_York')))
        = greatest(0, least(coalesce(p_local_hour, 18), 23))
    -- Ends within the window, and has not already ended.
    and c.end_date >= (now() at time zone coalesce(p.timezone, 'America/New_York'))::date
    and c.end_date <= (now() at time zone coalesce(p.timezone, 'America/New_York'))::date
                      + greatest(0, coalesce(p_days_ahead, 1))
    and exists (
      select 1 from public.push_tokens t
       where t.user_id = p.id and t.disabled_at is null
    )
  on conflict (dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.enqueue_challenge_ending_reminders(integer, integer) from public;
revoke all on function public.enqueue_challenge_ending_reminders(integer, integer) from anon, authenticated;
grant execute on function public.enqueue_challenge_ending_reminders(integer, integer) to service_role;

-- prune_notification_queue — the queue is an audit trail, not an archive. Drop
-- terminal rows older than 30 days. Pending rows are never pruned.
create or replace function public.prune_notification_queue()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  delete from public.notification_queue
   where status in ('sent', 'failed', 'skipped')
     and created_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.prune_notification_queue() from public;
revoke all on function public.prune_notification_queue() from anon, authenticated;
grant execute on function public.prune_notification_queue() to service_role;

-- ===========================================================================
-- 7. Schedules. Same pg_cron/pg_net idiom as 0010 — secrets come from Vault at
--    fire time, never from this file or from cron.job.command.
-- ===========================================================================
-- cron.schedule upserts by job name, so re-running this migration is idempotent.
do $$
begin
  -- (a) Fill the queue, hourly at :05. Hourly is REQUIRED, not lazy: a single
  -- daily UTC run cannot be 7pm for users in different timezones. Each function
  -- selects only users whose LOCAL hour matches, and the per-local-day dedupe
  -- key means the other 23 ticks insert nothing for them.
  perform cron.schedule(
    'enqueue-streak-reminders',
    '5 * * * *',
    'select public.enqueue_streak_reminders(19);'
  );
  perform cron.schedule(
    'enqueue-challenge-reminders',
    '7 * * * *',
    'select public.enqueue_challenge_ending_reminders(18, 1);'
  );
  -- (c) Housekeeping, daily, alongside the 0010 purge and the 0020 prune.
  perform cron.schedule(
    'prune-notification-queue',
    '45 4 * * *',
    'select public.prune_notification_queue();'
  );
exception when others then
  -- pg_cron may be unavailable in a local/shadow database. The functions above
  -- still exist and can be invoked manually, so a missing scheduler must not
  -- fail the migration.
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end;
$$;

-- (b) Drain the queue, hourly at :15 — ten minutes after the enqueue tick, so a
-- row queued this hour is delivered this hour. Kept as its own cron.schedule
-- call (not folded into the block above) because it is the one job that leaves
-- the database: it POSTs to the edge function via pg_net with secrets read from
-- Vault at fire time. If the Vault secrets are absent the function returns 403
-- and rows simply stay pending — fail-closed.
do $$
begin
  perform cron.schedule(
    'send-push-notifications',
    '15 * * * *',
    $job$
    select net.http_post(
      url     := 'https://zenwxynwkcbwmfedkixg.supabase.co/functions/v1/send-notifications',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'apikey',        (select decrypted_secret from vault.decrypted_secrets where name = 'project_anon_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'project_anon_key'),
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_notifications_secret')
      ),
      body    := '{}'::jsonb
    );
    $job$
  );
exception when others then
  raise notice 'pg_cron send scheduling skipped: %', sqlerrm;
end;
$$;
