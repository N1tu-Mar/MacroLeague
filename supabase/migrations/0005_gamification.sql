-- Phase 2 gamification: backend-owned XP, points, streaks, and counters.
--
-- This migration is forward-only and additive. It never edits migrations
-- 0001-0004. It introduces the first secure gamification loop:
--
--   confirmed meal insert (logMeal -> meal_logs)
--     -> AFTER INSERT trigger (database-owned, runs inside the same txn)
--       -> append an auditable gamification_events ledger row (base meal award)
--       -> upsert the user's local-calendar daily activity row
--       -> advance/maintain the streak (at most once per local calendar day)
--       -> increment the profile's XP / points / total_meals_logged counters
--
-- DESIGN PRINCIPLES (see prompt "Implement Backend-Owned XP, Points, and Streaks")
--   * The DATABASE owns XP/points/streaks/counters. The Expo client can read its
--     own profile but is physically prevented from writing the gamification
--     columns (column-level UPDATE is revoked below) and cannot insert ledger
--     rows (no client INSERT policy). The award path is a SECURITY DEFINER
--     trigger owned by the table owner, so it is the only writer.
--   * Awarding is IDEMPOTENT. meal_logs already has a unique (user_id,
--     client_request_id) index, so a retried logMeal cannot insert a second row
--     and the trigger fires exactly once per meal. The ledger's unique index is a
--     second, independent guarantee that one meal can never award twice.
--   * Manual, direct-USDA, and composite logs all insert into meal_logs, so they
--     all receive the SAME base meal award. The award amounts live in ONE place
--     (the trigger function constants) instead of being duplicated in the client.
--   * Awards are evaluated atomically with the meal insert: the ledger row, the
--     daily-activity row, and the profile counters all commit (or roll back) with
--     the meal in a single transaction.
--
-- STREAK DEFINITION (this phase): a "logging streak" — consecutive local calendar
-- days (in the profile's timezone) on which the user logged at least one meal.
--   * At most one streak-day credit per local calendar day.
--   * The first meal of a new local day either starts (1), maintains (+1 if the
--     previous credited day was exactly yesterday), or resets (1, after a gap).
--   * longest_streak never decreases.
--   * Additional meals the same day raise meal_count but never the streak.
--   * Backdated meals (a local day strictly earlier than the last credited day)
--     award XP/points + meal_count but do NOT move the streak, so they cannot
--     corrupt the current run.
-- Protein-goal / macro-goal streaks are intentionally deferred: they are
-- non-monotonic under same-day edits/deletes and need their own design. The
-- user_daily_activity table is shaped so that work can layer on later.
--
-- EDIT/DELETE SEMANTICS (this phase, documented & deliberate): the trigger fires
-- on INSERT only, so editing or deleting a meal does NOT reverse earned XP/points
-- or the streak, and does not decrement meal_count. This is the conservative MVP
-- rule. It guarantees retries never double-award; it does mean a user could log,
-- earn, then delete. Reversal/clawback logic and abuse controls (rate limits,
-- review windows) are required before any real monetary reward launch.

-- ---------------------------------------------------------------------------
-- 1. Expand profiles with gamification counters.
--    All NOT NULL with conservative zero defaults so existing rows backfill
--    cleanly. Every counter is constrained non-negative. last_activity_date is
--    the last LOCAL calendar day that earned a streak credit; it powers the
--    consecutive-day check without trusting the client clock.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column xp integer not null default 0,
  add column points integer not null default 0,
  add column streak_count integer not null default 0,
  add column longest_streak integer not null default 0,
  add column total_meals_logged integer not null default 0,
  add column challenges_won integer not null default 0,
  add column last_activity_date date,
  add constraint profiles_xp_nonnegative check (xp >= 0),
  add constraint profiles_points_nonnegative check (points >= 0),
  add constraint profiles_streak_count_nonnegative check (streak_count >= 0),
  add constraint profiles_longest_streak_nonnegative check (longest_streak >= 0),
  add constraint profiles_total_meals_nonnegative check (total_meals_logged >= 0),
  add constraint profiles_challenges_won_nonnegative check (challenges_won >= 0),
  -- longest_streak is a high-water mark, so it can never be below the current run.
  add constraint profiles_longest_ge_current check (longest_streak >= streak_count);

comment on column public.profiles.xp is
  'Backend-owned experience points. Written only by the gamification trigger; client UPDATE on this column is revoked.';
comment on column public.profiles.points is
  'Backend-owned redeemable points. Written only by the gamification trigger (earning) / future redemption RPC; client UPDATE revoked.';
comment on column public.profiles.last_activity_date is
  'Last LOCAL calendar day (profile timezone) that earned a streak credit. Drives the consecutive-day streak check without trusting the device clock.';

-- ---------------------------------------------------------------------------
-- 2. Append-only gamification ledger.
--    Every XP/points movement is one auditable row. Counters on profiles are a
--    cached projection of this ledger, so balances are always reconstructable.
-- ---------------------------------------------------------------------------
create table public.gamification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- What happened. Constrained instead of free text so the ledger stays queryable.
  event_type text not null,
  -- What produced it, plus the producing row's id (e.g. the meal_logs.id).
  source_type text not null,
  source_id uuid,
  xp_delta integer not null default 0,
  points_delta integer not null default 0,
  occurred_at timestamptz not null default now(),
  metadata jsonb,
  constraint gamification_events_event_type_check
    check (event_type in ('meal_logged', 'streak_bonus', 'challenge_win', 'reward_redemption', 'manual_adjustment')),
  constraint gamification_events_source_type_check
    check (source_type in ('meal_log', 'streak', 'challenge', 'reward', 'system'))
);

-- Idempotency: a given (user, event_type, source_type, source_id) can exist once.
-- Partial (source_id is not null) so system/manual events without a source row
-- are not forced unique. This is what makes a meal award impossible to duplicate.
create unique index gamification_events_unique_source
  on public.gamification_events (user_id, event_type, source_type, source_id)
  where source_id is not null;

create index gamification_events_user_occurred
  on public.gamification_events (user_id, occurred_at desc);

comment on table public.gamification_events is
  'Append-only audit ledger of every XP/points movement. profiles.xp/points are a cached sum of these rows; never the source of truth.';
comment on index public.gamification_events_unique_source is
  'Guarantees one event per source row (e.g. one award per meal) so retries/replays cannot award twice.';

-- ---------------------------------------------------------------------------
-- 3. Per-user, per-local-day activity. One row per (user, local calendar day).
--    meal_count is the day's logged-meal tally; first/last_logged_at bound the
--    day. Streak logic reads/writes this to enforce one credit per day.
-- ---------------------------------------------------------------------------
create table public.user_daily_activity (
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_date date not null,
  meal_count integer not null default 0,
  first_logged_at timestamptz,
  last_logged_at timestamptz,
  primary key (user_id, activity_date),
  constraint user_daily_activity_meal_count_nonnegative check (meal_count >= 0)
);

comment on table public.user_daily_activity is
  'One row per user per LOCAL calendar day (profile timezone). meal_count is the day''s tally; the streak engine credits at most one streak-day per row.';

-- ---------------------------------------------------------------------------
-- 4. The database-owned award function + trigger.
--    SECURITY DEFINER with a pinned search_path so it runs as the table owner and
--    can write the gamification tables/profile counters regardless of the calling
--    user's RLS. It is invoked ONLY by the AFTER INSERT trigger on meal_logs; the
--    client never calls it directly and cannot insert ledger rows itself.
--
--    No recursion risk: this trigger writes gamification_events,
--    user_daily_activity, and profiles. None of those tables has a trigger that
--    inserts into meal_logs, so the chain terminates.
-- ---------------------------------------------------------------------------
create or replace function public.award_meal_gamification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- One centralized definition of the base meal award. Manual / USDA-direct /
  -- composite logs are all plain meal_logs inserts, so they all earn this.
  c_base_meal_xp     constant integer := 50;
  c_base_meal_points constant integer := 10;

  v_tz            text;
  v_local_date    date;
  v_event_id      uuid;
  v_is_new_day    boolean;
  v_cur_streak    integer;
  v_cur_longest   integer;
  v_prev_date     date;
  v_new_streak    integer;
  v_advance       boolean := false;
begin
  -- Resolve the user's timezone (default matches the profiles.timezone default).
  -- A missing profile is impossible here because meal_logs.user_id FKs profiles,
  -- but we guard defensively rather than award against a phantom user.
  select coalesce(timezone, 'America/New_York')
    into v_tz
  from public.profiles
  where id = new.user_id;

  if v_tz is null then
    return new;
  end if;

  -- The meal's LOCAL calendar day, derived from eaten_at in the profile's
  -- timezone (never the device clock). This is the unit the streak runs on.
  v_local_date := (new.eaten_at at time zone v_tz)::date;

  -- (a) Idempotent base award. The unique index makes a replay a no-op: if a
  -- ledger row for this meal already exists, ON CONFLICT DO NOTHING returns no
  -- row, v_event_id stays NULL, and we touch nothing else. With meal_logs'
  -- (user_id, client_request_id) idempotency this is a second safety net.
  insert into public.gamification_events
    (user_id, event_type, source_type, source_id, xp_delta, points_delta, metadata)
  values
    (new.user_id, 'meal_logged', 'meal_log', new.id, c_base_meal_xp, c_base_meal_points,
     jsonb_build_object(
       'meal_source', coalesce(new.source, 'manual'),
       'activity_date', v_local_date
     ))
  on conflict (user_id, event_type, source_type, source_id) where source_id is not null
  do nothing
  returning id into v_event_id;

  if v_event_id is null then
    -- Already awarded for this meal; do not move counters/streak again.
    return new;
  end if;

  -- (b) Upsert the local-day activity row. The (xmax = 0) idiom tells us, atomically,
  -- whether THIS statement inserted the row (true => first meal of the day) or
  -- merely incremented an existing one.
  insert into public.user_daily_activity
    (user_id, activity_date, meal_count, first_logged_at, last_logged_at)
  values
    (new.user_id, v_local_date, 1, new.eaten_at, new.eaten_at)
  on conflict (user_id, activity_date) do update
    set meal_count      = public.user_daily_activity.meal_count + 1,
        first_logged_at = least(public.user_daily_activity.first_logged_at, excluded.first_logged_at),
        last_logged_at  = greatest(public.user_daily_activity.last_logged_at, excluded.last_logged_at)
  returning (xmax = 0) into v_is_new_day;

  -- (c) Streak: credited at most once per local day (only when this was the day's
  -- first meal). Lock the profile row so concurrent inserts serialize cleanly.
  if v_is_new_day then
    select streak_count, longest_streak, last_activity_date
      into v_cur_streak, v_cur_longest, v_prev_date
    from public.profiles
    where id = new.user_id
    for update;

    if v_prev_date is null or v_local_date > v_prev_date then
      -- Only move the streak FORWARD in time. A day exactly after the previous
      -- credited day extends the run; any larger gap (or the first ever day)
      -- starts a fresh run at 1.
      if v_prev_date is not null and v_local_date = v_prev_date + 1 then
        v_new_streak := v_cur_streak + 1;
      else
        v_new_streak := 1;
      end if;
      v_advance := true;
    else
      -- Same day re-credit (shouldn't happen) or a backdated earlier day: leave
      -- the streak and last_activity_date untouched.
      v_advance := false;
    end if;
  end if;

  -- (d) Apply the cached counters in one statement. XP/points/total_meals_logged
  -- move for EVERY awarded meal; streak fields move only when advancing.
  update public.profiles
  set xp                 = xp + c_base_meal_xp,
      points             = points + c_base_meal_points,
      total_meals_logged = total_meals_logged + 1,
      streak_count       = case when v_advance then v_new_streak else streak_count end,
      longest_streak     = case when v_advance then greatest(longest_streak, v_new_streak) else longest_streak end,
      last_activity_date = case when v_advance then v_local_date else last_activity_date end,
      updated_at         = now()
  where id = new.user_id;

  return new;
end;
$$;

comment on function public.award_meal_gamification() is
  'Database-owned, idempotent meal award. Runs inside the meal insert txn as the table owner (SECURITY DEFINER) so the client can never write XP/points itself. Awards base XP/points once per meal, tallies local-day activity, and advances the logging streak at most once per local calendar day.';

create trigger on_meal_logged_award
  after insert on public.meal_logs
  for each row execute function public.award_meal_gamification();

-- ---------------------------------------------------------------------------
-- 5. RLS for the new tables: users may READ their own gamification data, and
--    nothing else. There is intentionally NO client INSERT/UPDATE/DELETE policy,
--    so the only writer is the SECURITY DEFINER trigger above.
-- ---------------------------------------------------------------------------
alter table public.gamification_events enable row level security;
alter table public.user_daily_activity enable row level security;

create policy "read own gamification events"
  on public.gamification_events
  for select
  using (user_id = auth.uid());

create policy "read own daily activity"
  on public.user_daily_activity
  for select
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. Lock down the profile gamification columns at the privilege layer.
--    RLS controls WHICH ROWS a user can touch; it cannot stop a user from writing
--    the xp/points columns of their OWN row. Postgres column privileges can. We
--    revoke blanket UPDATE from the client roles, then re-grant UPDATE on exactly
--    the user-editable columns (username, timezone, goal_*). xp, points,
--    streak_count, longest_streak, total_meals_logged, challenges_won, and
--    last_activity_date are deliberately excluded, so the client physically
--    cannot submit arbitrary XP/points. The SECURITY DEFINER trigger (table
--    owner) and service_role are unaffected.
-- ---------------------------------------------------------------------------
revoke update on public.profiles from anon, authenticated;

grant update (
  username,
  timezone,
  goal_calories,
  goal_protein_g,
  goal_carbs_g,
  goal_unsaturated_fat_g,
  goal_trans_fat_g
) on public.profiles to authenticated;
