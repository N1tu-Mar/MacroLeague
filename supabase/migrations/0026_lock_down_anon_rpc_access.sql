-- ===========================================================================
-- 0026 — Remove unauthenticated (anon) access to client RPCs and two
--        public-defaulted read policies.
--
-- WHY: On Supabase, `revoke ... from public` does NOT remove the platform's
-- default EXECUTE grant held by the `anon` and `authenticated` roles — both
-- must be named explicitly. Migrations 0020–0025 do this; the earlier ones
-- (0006–0016) only revoked from PUBLIC, so every function they created stayed
-- callable by `anon` (the unauthenticated role behind the public anon key that
-- ships in the app bundle).
--
-- Most of those functions self-guard (mutations raise 'Not authenticated';
-- per-user reads filter on auth.uid() and return nothing to anon). But TWO
-- aggregate cross-user profile data with NO auth.uid() filter:
--   * get_leaderboard        → top-100 username/display_name/university/avatar
--   * get_challenge_standings → every participant's name/avatar/team
-- With only the anon key an attacker could POST to these RPCs (no JWT) and
-- harvest the user base's real names and universities. This migration closes
-- that and hardens the rest for consistency / defense-in-depth.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The two genuine leaks: recreate with an explicit `auth.uid() is not null`
--    guard (belt-and-braces even if a grant ever regresses), then revoke from
--    anon and re-grant to authenticated only.
-- ---------------------------------------------------------------------------

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
set search_path to 'public', 'pg_temp'
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
  -- auth.uid() is null → an unauthenticated caller gets zero rows even if the
  -- EXECUTE grant is ever wrongly restored.
  where p.deactivated_at is null
    and auth.uid() is not null
  group by p.id, p.username, p.display_name, p.university, p.avatar_url, p.streak_count
  having coalesce(sum(e.leaderboard_delta), 0) > 0
  order by score desc, p.streak_count desc
  limit 100;
$$;

revoke all on function public.get_leaderboard(integer) from public;
revoke all on function public.get_leaderboard(integer) from anon, authenticated;
grant execute on function public.get_leaderboard(integer) to authenticated;

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
set search_path to 'public', 'pg_temp'
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
    and auth.uid() is not null
  order by score desc, p.streak_count desc;
$$;

revoke all on function public.get_challenge_standings(uuid) from public;
revoke all on function public.get_challenge_standings(uuid) from anon, authenticated;
grant execute on function public.get_challenge_standings(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Every other client RPC created before 0020: revoke the surviving anon
--    EXECUTE grant. These already self-guard, so this is defense-in-depth and
--    consistency — no anon caller should reach them at all. Done by name via
--    regprocedure so overloaded signatures are handled without hand-typing.
--    authenticated / service_role grants are untouched.
-- ---------------------------------------------------------------------------
do $$
declare
  fn_name text;
  proc    regprocedure;
  -- The app's own client RPCs (NOT pg_trgm extension internals, which anon
  -- legitimately needs for trigram search operators).
  app_fns text[] := array[
    'create_challenge', 'disable_push_token', 'ensure_notification_preferences',
    'get_challenge_invites', 'get_friend_requests', 'get_friends',
    'get_friends_leaderboard', 'get_notification_preferences', 'invite_to_challenge',
    'leave_challenge', 'reactivate_account', 'redeem_reward', 'register_push_token',
    'remove_friend', 'request_account_deletion', 'respond_challenge_invite',
    'respond_friend_request', 'reward_code_ttl_days', 'search_users',
    'send_friend_request', 'update_notification_preferences'
  ];
begin
  foreach fn_name in array app_fns loop
    for proc in
      select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = fn_name
    loop
      execute format('revoke all on function %s from anon;', proc);
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Re-scope the two SELECT policies that 0024's cleanup missed. Both default
--    to PUBLIC (so anon can read them); neither holds personal data, but there
--    is no reason an unauthenticated caller should read the partner rewards
--    catalog or the scoring-config JSON. Match 0024's `to authenticated` shape.
-- ---------------------------------------------------------------------------
drop policy if exists "read rewards catalog" on public.rewards;
create policy "read rewards catalog"
  on public.rewards
  for select
  to authenticated
  using (true);

drop policy if exists "read system and own rule sets" on public.gamification_rule_sets;
create policy "read system and own rule sets"
  on public.gamification_rule_sets
  for select
  to authenticated
  using (scope = 'system' or owner_user_id = auth.uid());
