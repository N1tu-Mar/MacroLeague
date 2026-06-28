-- Account soft-delete with a recovery window.
--
-- Forward-only and ADDITIVE on top of 0001-0008. It never edits earlier
-- migrations. It introduces a "deactivated / scheduled-for-deletion" state on
-- profiles so an in-app "delete my account" does NOT immediately destroy data.
--
-- WHY SOFT DELETE (the security + UX rationale)
--   * Accidental / malicious deletion is recoverable. If an attacker who has the
--     user's password triggers a delete, the account is only ARCHIVED for a grace
--     window (default 14 days). The real owner can sign back in (after a password
--     reset if needed) and REACTIVATE — nothing is gone yet. A hard delete would
--     give the owner no way back.
--   * The user's data is kept intact during the window (this is just two flag
--     columns), so reactivation is a trivial "clear the flags" — no restore from
--     backup, no re-import.
--   * Only after the window passes is the account PERMANENTLY purged, by a
--     scheduled job (the `purge-accounts` edge function) that calls the Supabase
--     admin API to delete the auth user. Every public table FKs profiles/auth.users
--     with ON DELETE CASCADE (foods.created_by is SET NULL), so the purge removes
--     all personal rows while keeping shared USDA food cache.
--
-- WHO CAN WRITE THE STATE
--   The two new columns are NOT in the client UPDATE allow-list (0005/0006 revoked
--   blanket UPDATE on profiles and re-granted only specific columns). They are
--   written ONLY by the two SECURITY DEFINER RPCs below, each acting on auth.uid().
--   So a client can request deletion / reactivation of THEIR OWN account and
--   nothing else, and can never set these columns directly.

-- ===========================================================================
-- 1. State columns. NULL deactivated_at == an active account (the normal case).
-- ===========================================================================
alter table public.profiles
  add column deactivated_at timestamptz,
  add column deletion_scheduled_at timestamptz;

comment on column public.profiles.deactivated_at is
  'When the user requested account deletion. NULL = active account. While set, the app gates the user into the reactivation screen and hides them from leaderboards.';
comment on column public.profiles.deletion_scheduled_at is
  'When the archived account becomes eligible for PERMANENT purge (deactivated_at + grace window). The purge job deletes only rows at/after this time; before it, the user can reactivate.';

-- Supports the purge job's "who is past the window" scan without a full table scan.
create index profiles_deletion_scheduled
  on public.profiles (deletion_scheduled_at)
  where deletion_scheduled_at is not null;

-- ===========================================================================
-- 2. request_account_deletion(): archive the caller's OWN account. Idempotent —
--    re-requesting keeps the ORIGINAL schedule (coalesce), so it cannot be used to
--    extend the window. Returns the scheduled purge time for the confirmation UI.
-- ===========================================================================
create or replace function public.request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_scheduled timestamptz;
  c_grace_days constant integer := 14;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
  set deactivated_at        = coalesce(deactivated_at, now()),
      deletion_scheduled_at = coalesce(deletion_scheduled_at, now() + make_interval(days => c_grace_days)),
      updated_at            = now()
  where id = v_user
  returning deletion_scheduled_at into v_scheduled;

  if v_scheduled is null then
    raise exception 'Your account profile is missing';
  end if;

  return v_scheduled;
end;
$$;

revoke all on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;

comment on function public.request_account_deletion() is
  'Archives the caller''s own account (auth.uid()) with a 14-day recovery window and returns the scheduled purge time. Idempotent: re-requesting never extends the window. The only path that sets the deletion flags; the client cannot write them directly.';

-- ===========================================================================
-- 3. reactivate_account(): clear the caller's OWN deletion flags, but only while
--    still inside the recovery window. Past the window the account is eligible for
--    (or already undergoing) permanent purge, so we refuse rather than pretend.
-- ===========================================================================
create or replace function public.reactivate_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_sched timestamptz;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select deletion_scheduled_at into v_sched
  from public.profiles where id = v_user for update;

  if v_sched is not null and v_sched <= now() then
    raise exception 'The recovery window has expired. Please contact support.';
  end if;

  update public.profiles
  set deactivated_at        = null,
      deletion_scheduled_at = null,
      updated_at            = now()
  where id = v_user;
end;
$$;

revoke all on function public.reactivate_account() from public;
grant execute on function public.reactivate_account() to authenticated;

comment on function public.reactivate_account() is
  'Clears the caller''s own deletion flags (recovers the account) while still inside the recovery window. The only client path back from an archived account.';

-- ===========================================================================
-- 4. Hide archived accounts from cross-user read models. Same bodies as 0006/0007
--    with an added `deactivated_at is null` filter so a user mid-deletion does not
--    appear on the global leaderboard or in challenge standings.
-- ===========================================================================
create or replace function public.get_leaderboard(p_window_days integer default 14)
returns table (
  user_id uuid,
  username text,
  display_name text,
  university text,
  avatar_url text,
  score bigint,
  streak_count integer
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.university,
    p.avatar_url,
    coalesce(sum(e.leaderboard_delta), 0)::bigint as score,
    p.streak_count
  from public.profiles p
  join public.gamification_events e
    on e.user_id = p.id
   and e.leaderboard_delta <> 0
   and e.occurred_at >= now() - make_interval(days => least(greatest(p_window_days, 1), 60))
  where p.deactivated_at is null
  group by p.id, p.username, p.display_name, p.university, p.avatar_url, p.streak_count
  having coalesce(sum(e.leaderboard_delta), 0) > 0
  order by score desc, p.streak_count desc
  limit 100;
$$;

create or replace function public.get_challenge_standings(p_challenge_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  team_name text,
  streak_count integer,
  score bigint
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    cp.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    cp.team_name,
    p.streak_count,
    coalesce((
      select sum(e.leaderboard_delta)
      from public.gamification_events e
      where e.user_id = cp.user_id
        and e.leaderboard_delta <> 0
        and e.occurred_at >= c.start_date::timestamptz
        and e.occurred_at <  (c.end_date + 1)::timestamptz
    ), 0)::bigint as score
  from public.challenge_participants cp
  join public.challenges c on c.id = cp.challenge_id
  join public.profiles    p on p.id = cp.user_id
  where cp.challenge_id = p_challenge_id
    and p.deactivated_at is null
  order by score desc, p.streak_count desc;
$$;
