-- Phase 1 challenges: a real, Supabase-backed challenge system.
--
-- Forward-only and ADDITIVE on top of 0001-0006. It never edits earlier
-- migrations. It introduces the first real competition layer beyond the global
-- leaderboard:
--
--   challenges              one row per challenge (creator-owned)
--   challenge_participants  membership (one row per user per challenge)
--   challenge_goals         the goals stacked on a challenge (display targets)
--
-- TRUST MODEL (mirrors get_leaderboard in 0006):
--   * Participant SCORES are DERIVED, never client-set. get_challenge_standings()
--     sums each participant's gamification_events.leaderboard_delta inside the
--     challenge's [start_date, end_date] window. That is the SAME trusted ledger
--     the global leaderboard uses, so a client can never inject a score. There is
--     no client-writable score column anywhere in these tables.
--   * Reads that must cross users (other participants' display names + scores) go
--     through a SECURITY DEFINER function, because profiles RLS only lets a user
--     read their OWN profile row.
--   * Writes are tightly scoped by RLS: a user may create a challenge as
--     themselves, join as themselves, and leave their own membership. Nobody can
--     edit another user's participant row.
--
-- DELIBERATE PHASE 1 LIMITS (documented):
--   * Status (upcoming/active/completed) is DERIVED from dates at read time, so no
--     cron is needed and it can never go stale.
--   * No auto-finalization / winner declaration / challenge_win point award yet.
--     profiles.challenges_won therefore stays 0 until a later finalize step adds
--     it; the schema (gamification_events.event_type 'challenge_win', source_type
--     'challenge') is already ready for it.
--   * The event window uses UTC date boundaries (start_date 00:00 UTC .. end_date+1
--     00:00 UTC). Per-user-timezone challenge windows can layer on later.
--   * No invitations, team chat, stakes payments, or floor-vs-floor. "team_name"
--     is a free-text grouping for team challenges.

-- ===========================================================================
-- 1. challenges. Creator-owned; dates validated; constrained type/goal/duration.
-- ===========================================================================
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  type text not null default 'team',
  goal_type text not null default 'points',
  stakes_text text not null default 'Bragging rights',
  duration_days integer not null,
  start_date date not null default current_date,
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint challenges_name_length check (char_length(name) between 1 and 80),
  constraint challenges_type_check check (type in ('solo', 'team')),
  -- Supported goal themes that can be described/scored reliably in Phase 1.
  constraint challenges_goal_type_check check (goal_type in ('points', 'protein', 'meal_count', 'streak')),
  constraint challenges_duration_check check (duration_days in (3, 7, 14, 21, 30)),
  constraint challenges_date_range check (end_date > start_date),
  constraint challenges_stakes_length check (char_length(stakes_text) <= 120)
);

create index challenges_created_by on public.challenges (created_by);
create index challenges_dates on public.challenges (start_date, end_date);

comment on table public.challenges is
  'Creator-owned competitions. Status is derived from start_date/end_date at read time. Participant scores are derived from the gamification_events ledger (see get_challenge_standings), never stored or client-set.';

-- ===========================================================================
-- 2. challenge_participants. One membership row per (challenge, user).
-- ===========================================================================
create table public.challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_name text not null default 'Solo',
  joined_at timestamptz not null default now(),
  constraint cp_team_name_length check (char_length(team_name) between 1 and 40)
);

-- Prevent duplicate membership: a user can be in a challenge at most once.
create unique index challenge_participants_unique
  on public.challenge_participants (challenge_id, user_id);
create index challenge_participants_user on public.challenge_participants (user_id);

comment on index public.challenge_participants_unique is
  'A user can join a given challenge at most once; a retried join is a harmless no-op/handled error.';

-- ===========================================================================
-- 3. challenge_goals. Stacked display targets for a challenge. Completion is NOT
--    auto-evaluated in Phase 1 (documented), so there is no fake "completed" flag.
-- ===========================================================================
create table public.challenge_goals (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  goal_type text not null,
  description text not null,
  target_value numeric(10,1) not null,
  points_value integer not null default 0,
  created_at timestamptz not null default now(),
  constraint challenge_goals_points_nonneg check (points_value >= 0),
  constraint challenge_goals_desc_length check (char_length(description) between 1 and 120)
);

create index challenge_goals_challenge on public.challenge_goals (challenge_id);

-- ===========================================================================
-- 4. create_challenge(): atomically insert the challenge, enroll the creator, and
--    seed a starter goal. SECURITY DEFINER so the three writes commit together and
--    auth.uid() is the trusted creator. Returns the new challenge id.
-- ===========================================================================
create or replace function public.create_challenge(
  p_name text,
  p_type text,
  p_goal_type text,
  p_duration_days integer,
  p_stakes text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_id    uuid;
  v_end   date := current_date + p_duration_days;
  v_desc  text;
  v_target numeric;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.challenges
    (created_by, name, type, goal_type, stakes_text, duration_days, start_date, end_date)
  values
    (v_user, p_name, p_type, p_goal_type,
     coalesce(nullif(btrim(p_stakes), ''), 'Bragging rights'),
     p_duration_days, current_date, v_end)
  returning id into v_id;

  insert into public.challenge_participants (challenge_id, user_id, team_name)
  values (v_id, v_user, case when p_type = 'solo' then 'Solo' else 'My Team' end);

  -- Seed one starter goal that reads sensibly for the chosen theme.
  if p_goal_type = 'protein' then
    v_desc := 'Hit your daily protein goal'; v_target := p_duration_days;
  elsif p_goal_type = 'meal_count' then
    v_desc := 'Log your meals every day'; v_target := p_duration_days;
  elsif p_goal_type = 'streak' then
    v_desc := 'Keep your logging streak alive'; v_target := p_duration_days;
  else
    v_desc := 'Earn the most league points'; v_target := 500;
  end if;

  insert into public.challenge_goals (challenge_id, goal_type, description, target_value, points_value)
  values (v_id, p_goal_type, v_desc, v_target, 50);

  return v_id;
end;
$$;

revoke all on function public.create_challenge(text, text, text, integer, text) from public;
grant execute on function public.create_challenge(text, text, text, integer, text) to authenticated;

comment on function public.create_challenge(text, text, text, integer, text) is
  'Atomically creates a challenge owned by auth.uid(), enrolls the creator, and seeds a starter goal. Returns the challenge id.';

-- ===========================================================================
-- 5. get_challenge_standings(): ranked participants with DERIVED scores. SECURITY
--    DEFINER so it can expose other participants' display fields (profiles RLS
--    restricts a user to their own row) and aggregate across the ledger. Score =
--    sum of leaderboard_delta within the challenge's date window (UTC bounds).
-- ===========================================================================
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
  order by score desc, p.streak_count desc;
$$;

revoke all on function public.get_challenge_standings(uuid) from public;
grant execute on function public.get_challenge_standings(uuid) to authenticated;

comment on function public.get_challenge_standings(uuid) is
  'Ranks a challenge''s participants by summed leaderboard_delta within its date window. SECURITY DEFINER to read cross-user display fields + aggregate the trusted ledger; exposes only display fields + the derived score.';

-- ===========================================================================
-- 6. RLS. Challenges + participants + goals are discoverable by authenticated
--    users (a campus competition app); writes are scoped to the actor.
-- ===========================================================================
alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.challenge_goals enable row level security;

-- Challenges: anyone signed in can discover them; only the creator writes.
create policy "read challenges"
  on public.challenges
  for select
  using (true);

create policy "create own challenges"
  on public.challenges
  for insert
  with check (created_by = auth.uid());

create policy "update own challenges"
  on public.challenges
  for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "delete own challenges"
  on public.challenges
  for delete
  using (created_by = auth.uid());

-- Participants: membership is public within the app (counts/lists). A user may
-- only insert/delete/update THEIR OWN participant row (never someone else's).
create policy "read participants"
  on public.challenge_participants
  for select
  using (true);

create policy "join as self"
  on public.challenge_participants
  for insert
  with check (user_id = auth.uid());

create policy "update own participation"
  on public.challenge_participants
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "leave as self"
  on public.challenge_participants
  for delete
  using (user_id = auth.uid());

-- Goals: readable by anyone signed in; writable only by the challenge's creator.
create policy "read challenge goals"
  on public.challenge_goals
  for select
  using (true);

create policy "creator manages goals"
  on public.challenge_goals
  for insert
  with check (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and c.created_by = auth.uid()
    )
  );

create policy "creator updates goals"
  on public.challenge_goals
  for update
  using (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and c.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and c.created_by = auth.uid()
    )
  );

create policy "creator deletes goals"
  on public.challenge_goals
  for delete
  using (
    exists (
      select 1 from public.challenges c
      where c.id = challenge_id and c.created_by = auth.uid()
    )
  );
