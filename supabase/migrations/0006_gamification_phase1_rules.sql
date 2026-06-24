-- Phase 1 gamification rule engine.
--
-- Forward-only and ADDITIVE on top of 0005. It never edits 0001-0005; it extends
-- the existing backend-owned loop with a data-driven rule engine:
--
--   confirmed meal insert -> award_meal_gamification() (rewritten below)
--     -> base meal award (XP/points/leaderboard)            [as in 0005]
--     -> accumulate the day's macro totals on user_daily_activity
--     -> evaluate the ACTIVE rule set's enabled modules, each at most once/day:
--          * meal_count_goal_hit       (N meals logged today)
--          * daily_protein_goal_hit    (protein >= goal)
--          * daily_macro_accuracy_hit  (cal/protein/carbs within bands)
--     -> advance the logging streak [as in 0005] + emit streak_milestone events
--     -> roll the awarded XP/points up onto profiles
--
-- DESIGN INVARIANTS (carried from 0005, preserved here):
--   * The DATABASE owns all XP/points/streak writes (SECURITY DEFINER trigger /
--     RPCs). The client physically cannot write the gamification columns.
--   * One meal awards AT MOST once: the base-award ledger row is the idempotency
--     gate (unique index from 0005). If it is a replay, the trigger returns before
--     any rule runs, so no rule can double-award either.
--   * Each DAILY rule awards AT MOST once per local calendar day, guarded by the
--     per-rule *_goal_met flags on user_daily_activity (checked under a row lock).
--   * Rule thresholds/toggles/award amounts live in gamification_rule_sets.rules
--     (JSON), so a user/league can enable, disable, and tune modules as data.
--
-- DELIBERATE LIMITATIONS (documented, same conservative MVP stance as 0005):
--   * The trigger fires on INSERT only. Editing/deleting a meal does NOT reverse
--     awarded XP/points, the streak, or the day's accumulated macro totals. Daily
--     goal evaluation therefore uses the running INSERT-only sum.
--   * Macro accuracy scores calories, protein, and carbs. Total-fat is excluded
--     because the schema stores only an UNSATURATED-fat goal (goal_unsaturated_fat_g)
--     while meal_logs.fat_g is TOTAL fat; comparing the two would be meaningless.
--   * No seeded competitor profiles: profiles.id FKs auth.users, so fake users
--     cannot be inserted here. The leaderboard ranks real signed-up users; the
--     Friends/My Team tabs show empty/seeded Phase 1 states until those support
--     tables are populated.

-- ===========================================================================
-- 1. Denormalized profile fields for fast app/leaderboard reads.
--    All nullable; the client may edit these display fields (re-granted below).
-- ===========================================================================
alter table public.profiles
  add column display_name text,
  add column university text,
  add column goal_type text,
  add column avatar_url text;

-- 0005 revoked blanket UPDATE and re-granted only specific columns. Extend that
-- allow-list with the new user-editable display fields (still NOT the gamification
-- counters, which stay backend-only).
grant update (display_name, university, goal_type, avatar_url)
  on public.profiles to authenticated;

-- ===========================================================================
-- 2. Extend the ledger: leaderboard score delta + local-day/timezone stamping,
--    and allow the new Phase 1 event types.
-- ===========================================================================
alter table public.gamification_events
  add column leaderboard_delta integer not null default 0,
  add column source_local_date date,
  add column timezone text;

alter table public.gamification_events
  drop constraint gamification_events_event_type_check;
alter table public.gamification_events
  add constraint gamification_events_event_type_check
  check (event_type in (
    'meal_logged',
    'meal_count_goal_hit',
    'daily_protein_goal_hit',
    'daily_macro_accuracy_hit',
    'streak_bonus',
    'streak_milestone',
    'challenge_win',
    'reward_redemption',
    'manual_adjustment'
  ));

comment on column public.gamification_events.leaderboard_delta is
  'Configurable event-score contribution. Summed over a window to rank users; never reduced by reward redemption (redemptions use leaderboard_delta = 0).';

-- Window leaderboards sum leaderboard_delta over time, so index by time too.
create index gamification_events_user_occurred_lb
  on public.gamification_events (occurred_at)
  where leaderboard_delta <> 0;

-- ===========================================================================
-- 3. Extend daily activity with macro totals + per-rule award bookkeeping.
--    Macro columns are running INSERT-only sums (× quantity), matching how the
--    app computes daily totals (sumMealTotals: macro_per_serving × quantity).
-- ===========================================================================
alter table public.user_daily_activity
  add column timezone text,
  add column calories numeric(10,1) not null default 0,
  add column protein_g numeric(10,1) not null default 0,
  add column carbs_g numeric(10,1) not null default 0,
  add column fat_g numeric(10,1) not null default 0,
  add column meal_count_goal_met boolean not null default false,
  add column protein_goal_met boolean not null default false,
  add column macro_accuracy_goal_met boolean not null default false,
  add column qualified_for_streak boolean not null default false,
  add column meal_count_goal_awarded_at timestamptz,
  add column protein_goal_awarded_at timestamptz,
  add column macro_accuracy_awarded_at timestamptz;

-- ===========================================================================
-- 4. Data-driven rule sets. owner_user_id NULL = a system rule set. Phase 1 uses
--    one system default for everyone; a user may later own a personal rule set,
--    and leagues can own their own (same processors, no league-only logic).
-- ===========================================================================
create table public.gamification_rule_sets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles(id) on delete cascade,
  scope text not null default 'individual',
  name text not null,
  duration_days integer not null default 14,
  rules jsonb not null,
  is_default boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  constraint rule_sets_scope_check check (scope in ('system', 'individual', 'league')),
  -- 2 / 3 / 4 weeks + 1 month, matching the supported leaderboard windows.
  constraint rule_sets_duration_check check (duration_days in (14, 21, 28, 30)),
  constraint rule_sets_system_no_owner check (
    (scope = 'system') = (owner_user_id is null)
  )
);

-- Exactly one system default, and at most one default per owner.
create unique index rule_sets_one_system_default
  on public.gamification_rule_sets ((1))
  where scope = 'system' and is_default;
create unique index rule_sets_one_owner_default
  on public.gamification_rule_sets (owner_user_id)
  where owner_user_id is not null and is_default;

comment on table public.gamification_rule_sets is
  'Data-driven scoring config. rules JSON holds toggles/thresholds/award amounts for meal-count, protein, macro-accuracy, and streak modules so competition is not hardcoded to one formula.';

-- The Phase 1 system default. Award amounts mirror the existing app economy
-- (+50 XP / +10 pts per meal, +25 protein, +100 streak milestone) plus new
-- meal-count and macro-accuracy rewards. min_pct/bands are percentages of goal.
insert into public.gamification_rule_sets (owner_user_id, scope, name, duration_days, is_default, rules)
values (
  null,
  'system',
  'Default Individual',
  14,
  true,
  jsonb_build_object(
    'xp', jsonb_build_object('per_meal', 50),
    'points', jsonb_build_object(
      'per_meal', 10,
      'meal_count_goal', 15,
      'protein_goal', 25,
      'macro_accuracy', 30,
      'streak_milestone', 100
    ),
    'leaderboard', jsonb_build_object(
      'per_meal', 10,
      'meal_count_goal', 15,
      'protein_goal', 25,
      'macro_accuracy', 30,
      'streak_milestone', 50
    ),
    'meal_count', jsonb_build_object('enabled', true, 'required', 3),
    'protein_goal', jsonb_build_object('enabled', true, 'min_pct', 100),
    'macro_accuracy', jsonb_build_object(
      'enabled', true,
      'calories', jsonb_build_object('low_pct', 90, 'high_pct', 110),
      'protein', jsonb_build_object('low_pct', 100, 'high_pct', 1000),
      'carbs', jsonb_build_object('low_pct', 80, 'high_pct', 120)
    ),
    'streak', jsonb_build_object(
      'enabled', true,
      'rule', 'at_least_one_meal_logged',
      'milestones', jsonb_build_array(7, 14, 21, 30)
    )
  )
);

-- ===========================================================================
-- 5. Rewards catalog + per-user redemption ledger.
-- ===========================================================================
create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  partner_name text not null,
  partner_logo text not null default '🎁',
  description text not null,
  points_cost integer not null,
  category text not null default 'general',
  expiry_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint rewards_points_cost_nonnegative check (points_cost >= 0)
);

create table public.user_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_id uuid not null references public.rewards(id) on delete restrict,
  points_spent integer not null,
  redeemed_at timestamptz not null default now(),
  constraint user_rewards_points_spent_nonnegative check (points_spent >= 0)
);

create index user_rewards_user on public.user_rewards (user_id, redeemed_at desc);
-- One redemption per reward per user (the UI treats rewards as one-time unlocks).
create unique index user_rewards_unique on public.user_rewards (user_id, reward_id);

-- Seed the catalog so RewardsScreen renders real rows (matches former mock data).
insert into public.rewards (partner_name, partner_logo, description, points_cost, category, expiry_date) values
  ('Playa Bowls',        '🥣', '20% off any bowl',     500, 'Food',    '2026-12-01'),
  ('Fusion Smoothies',   '🥤', 'Free small smoothie',  350, 'Drinks',  '2026-12-15'),
  ('RU Café',            '☕', '$2 off any coffee',     200, 'Drinks',  '2026-12-30'),
  ('Scarlet Fitness',    '💪', 'Free day pass',        750, 'Fitness', '2026-12-01'),
  ('Muscle Meals Prep',  '🍱', '15% off weekly plan',  600, 'Food',    '2026-12-20');

-- ===========================================================================
-- 6. Rewritten award function: base award (idempotent) + macro accumulation +
--    data-driven daily rule modules + streak milestones, all in the meal txn.
-- ===========================================================================
create or replace function public.award_meal_gamification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz             text;
  v_local_date     date;
  v_event_id       uuid;
  v_is_new_day     boolean;
  v_cur_streak     integer;
  v_cur_longest    integer;
  v_prev_date      date;
  v_new_streak     integer;
  v_advance        boolean := false;

  -- Active rule set (own default, else the system default) + its parsed values.
  v_rules          jsonb;
  v_xp_per_meal    integer;
  v_pts_per_meal   integer;
  v_lb_per_meal    integer;

  -- The day's running totals AFTER this meal (returned by the upsert).
  v_meal_count     integer;
  v_calories       numeric;
  v_protein        numeric;
  v_carbs          numeric;
  v_fat            numeric;
  v_meal_goal_met  boolean;
  v_prot_goal_met  boolean;
  v_macro_goal_met boolean;

  -- The user's goals (for protein / macro-accuracy evaluation).
  v_goal_cal       integer;
  v_goal_prot      integer;
  v_goal_carbs     integer;

  -- Accumulated rollup for the single profile update at the end.
  v_xp_total       integer := 0;
  v_pts_total      integer := 0;

  -- This meal's contribution to the day's macro totals (per-serving × quantity).
  v_add_cal        numeric := new.calories * new.quantity;
  v_add_prot       numeric := new.protein_g * new.quantity;
  v_add_carbs      numeric := new.carbs_g * new.quantity;
  v_add_fat        numeric := new.fat_g * new.quantity;
begin
  select coalesce(timezone, 'America/New_York') into v_tz
  from public.profiles where id = new.user_id;
  if v_tz is null then
    return new;
  end if;

  v_local_date := (new.eaten_at at time zone v_tz)::date;

  -- Resolve the active rule set + award amounts ONCE up front.
  select rules into v_rules
  from public.gamification_rule_sets
  where (owner_user_id = new.user_id or scope = 'system') and is_default
  order by (owner_user_id is not null) desc  -- prefer the user's own default
  limit 1;
  if v_rules is null then
    v_rules := '{}'::jsonb;
  end if;

  v_xp_per_meal  := coalesce((v_rules #>> '{xp,per_meal}')::int, 50);
  v_pts_per_meal := coalesce((v_rules #>> '{points,per_meal}')::int, 10);
  v_lb_per_meal  := coalesce((v_rules #>> '{leaderboard,per_meal}')::int, 10);

  -- (a) Idempotent base award. A replay (same meal) inserts nothing, so we return
  -- before touching counters/streak/rules. This is the single idempotency gate.
  insert into public.gamification_events
    (user_id, event_type, source_type, source_id, xp_delta, points_delta,
     leaderboard_delta, source_local_date, timezone, metadata)
  values
    (new.user_id, 'meal_logged', 'meal_log', new.id, v_xp_per_meal, v_pts_per_meal,
     v_lb_per_meal, v_local_date, v_tz,
     jsonb_build_object('meal_source', coalesce(new.source, 'manual'), 'activity_date', v_local_date))
  on conflict (user_id, event_type, source_type, source_id) where source_id is not null
  do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return new;
  end if;

  v_xp_total  := v_xp_total + v_xp_per_meal;
  v_pts_total := v_pts_total + v_pts_per_meal;

  -- (b) Upsert the local-day row: bump meal_count + accumulate macro totals.
  -- (xmax = 0) tells us if THIS statement created the row (day's first meal).
  insert into public.user_daily_activity
    (user_id, activity_date, timezone, meal_count, calories, protein_g, carbs_g, fat_g,
     first_logged_at, last_logged_at)
  values
    (new.user_id, v_local_date, v_tz, 1, v_add_cal, v_add_prot, v_add_carbs, v_add_fat,
     new.eaten_at, new.eaten_at)
  on conflict (user_id, activity_date) do update
    set meal_count      = public.user_daily_activity.meal_count + 1,
        calories        = public.user_daily_activity.calories + excluded.calories,
        protein_g       = public.user_daily_activity.protein_g + excluded.protein_g,
        carbs_g         = public.user_daily_activity.carbs_g + excluded.carbs_g,
        fat_g           = public.user_daily_activity.fat_g + excluded.fat_g,
        timezone        = excluded.timezone,
        first_logged_at = least(public.user_daily_activity.first_logged_at, excluded.first_logged_at),
        last_logged_at  = greatest(public.user_daily_activity.last_logged_at, excluded.last_logged_at)
  returning (xmax = 0), meal_count, calories, protein_g, carbs_g, fat_g,
            meal_count_goal_met, protein_goal_met, macro_accuracy_goal_met
    into v_is_new_day, v_meal_count, v_calories, v_protein, v_carbs, v_fat,
         v_meal_goal_met, v_prot_goal_met, v_macro_goal_met;

  -- Load goals once for the protein / macro-accuracy modules.
  select goal_calories, goal_protein_g, goal_carbs_g
    into v_goal_cal, v_goal_prot, v_goal_carbs
  from public.profiles where id = new.user_id;

  -- (c) Meal-count rule: award once when the day's tally reaches the target.
  if coalesce((v_rules #>> '{meal_count,enabled}')::boolean, false)
     and not v_meal_goal_met
     and v_meal_count >= coalesce((v_rules #>> '{meal_count,required}')::int, 3) then
    insert into public.gamification_events
      (user_id, event_type, source_type, source_id, points_delta, leaderboard_delta,
       source_local_date, timezone, metadata)
    values
      (new.user_id, 'meal_count_goal_hit', 'meal_log', new.id,
       coalesce((v_rules #>> '{points,meal_count_goal}')::int, 15),
       coalesce((v_rules #>> '{leaderboard,meal_count_goal}')::int, 15),
       v_local_date, v_tz, jsonb_build_object('meal_count', v_meal_count));
    update public.user_daily_activity
      set meal_count_goal_met = true, meal_count_goal_awarded_at = now()
      where user_id = new.user_id and activity_date = v_local_date;
    v_pts_total := v_pts_total + coalesce((v_rules #>> '{points,meal_count_goal}')::int, 15);
  end if;

  -- (d) Protein rule: award once when the day's protein crosses goal × min_pct.
  if coalesce((v_rules #>> '{protein_goal,enabled}')::boolean, false)
     and not v_prot_goal_met
     and v_goal_prot is not null
     and v_protein >= v_goal_prot * coalesce((v_rules #>> '{protein_goal,min_pct}')::numeric, 100) / 100.0 then
    insert into public.gamification_events
      (user_id, event_type, source_type, source_id, points_delta, leaderboard_delta,
       source_local_date, timezone, metadata)
    values
      (new.user_id, 'daily_protein_goal_hit', 'meal_log', new.id,
       coalesce((v_rules #>> '{points,protein_goal}')::int, 25),
       coalesce((v_rules #>> '{leaderboard,protein_goal}')::int, 25),
       v_local_date, v_tz, jsonb_build_object('protein_g', v_protein, 'goal_protein_g', v_goal_prot));
    update public.user_daily_activity
      set protein_goal_met = true, protein_goal_awarded_at = now()
      where user_id = new.user_id and activity_date = v_local_date;
    v_pts_total := v_pts_total + coalesce((v_rules #>> '{points,protein_goal}')::int, 25);
  end if;

  -- (e) Macro-accuracy rule: award once when calories, protein, and carbs are all
  -- inside their configured % bands. Total-fat is excluded (no total-fat goal).
  if coalesce((v_rules #>> '{macro_accuracy,enabled}')::boolean, false)
     and not v_macro_goal_met
     and v_goal_cal is not null and v_goal_prot is not null and v_goal_carbs is not null
     and v_calories >= v_goal_cal  * coalesce((v_rules #>> '{macro_accuracy,calories,low_pct}')::numeric, 90)  / 100.0
     and v_calories <= v_goal_cal  * coalesce((v_rules #>> '{macro_accuracy,calories,high_pct}')::numeric, 110) / 100.0
     and v_protein  >= v_goal_prot * coalesce((v_rules #>> '{macro_accuracy,protein,low_pct}')::numeric, 100)  / 100.0
     and v_protein  <= v_goal_prot * coalesce((v_rules #>> '{macro_accuracy,protein,high_pct}')::numeric, 1000) / 100.0
     and v_carbs    >= v_goal_carbs * coalesce((v_rules #>> '{macro_accuracy,carbs,low_pct}')::numeric, 80)    / 100.0
     and v_carbs    <= v_goal_carbs * coalesce((v_rules #>> '{macro_accuracy,carbs,high_pct}')::numeric, 120)  / 100.0 then
    insert into public.gamification_events
      (user_id, event_type, source_type, source_id, points_delta, leaderboard_delta,
       source_local_date, timezone, metadata)
    values
      (new.user_id, 'daily_macro_accuracy_hit', 'meal_log', new.id,
       coalesce((v_rules #>> '{points,macro_accuracy}')::int, 30),
       coalesce((v_rules #>> '{leaderboard,macro_accuracy}')::int, 30),
       v_local_date, v_tz, jsonb_build_object('calories', v_calories, 'protein_g', v_protein, 'carbs_g', v_carbs));
    update public.user_daily_activity
      set macro_accuracy_goal_met = true, macro_accuracy_awarded_at = now()
      where user_id = new.user_id and activity_date = v_local_date;
    v_pts_total := v_pts_total + coalesce((v_rules #>> '{points,macro_accuracy}')::int, 30);
  end if;

  -- (f) Streak: credited at most once per local day (only on the day's first meal),
  -- and only moving forward in time. Identical rule to 0005, now also flagging the
  -- day as qualified and emitting a streak_milestone event at configured milestones.
  if v_is_new_day then
    select streak_count, longest_streak, last_activity_date
      into v_cur_streak, v_cur_longest, v_prev_date
    from public.profiles where id = new.user_id
    for update;

    if v_prev_date is null or v_local_date > v_prev_date then
      if v_prev_date is not null and v_local_date = v_prev_date + 1 then
        v_new_streak := v_cur_streak + 1;
      else
        v_new_streak := 1;
      end if;
      v_advance := true;

      update public.user_daily_activity
        set qualified_for_streak = true
        where user_id = new.user_id and activity_date = v_local_date;

      -- Milestone bonus when the new streak length is a configured milestone.
      if coalesce((v_rules #>> '{streak,enabled}')::boolean, false)
         and (v_rules #> '{streak,milestones}') @> to_jsonb(v_new_streak) then
        insert into public.gamification_events
          (user_id, event_type, source_type, source_id, points_delta, leaderboard_delta,
           source_local_date, timezone, metadata)
        values
          (new.user_id, 'streak_milestone', 'streak', new.id,
           coalesce((v_rules #>> '{points,streak_milestone}')::int, 100),
           coalesce((v_rules #>> '{leaderboard,streak_milestone}')::int, 50),
           v_local_date, v_tz, jsonb_build_object('streak', v_new_streak));
        v_pts_total := v_pts_total + coalesce((v_rules #>> '{points,streak_milestone}')::int, 100);
      end if;
    end if;
  end if;

  -- (g) Single rollup onto profiles: XP + all points earned this insert, the meal
  -- tally, and streak fields when advancing.
  update public.profiles
  set xp                 = xp + v_xp_total,
      points             = points + v_pts_total,
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
  'Database-owned, idempotent meal award + data-driven daily rule engine. Runs in the meal insert txn as table owner. Awards base XP/points once per meal, accumulates the day''s macros, evaluates the active rule set''s meal-count/protein/macro-accuracy modules (each at most once per local day), advances the logging streak, and emits streak milestones.';

-- ===========================================================================
-- 7. Leaderboard read model. A SECURITY DEFINER function so it can aggregate
--    ACROSS users (per-row RLS would otherwise restrict each user to their own
--    events). Returns only display fields + an aggregate score, never raw events.
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
  group by p.id, p.username, p.display_name, p.university, p.avatar_url, p.streak_count
  having coalesce(sum(e.leaderboard_delta), 0) > 0
  order by score desc, p.streak_count desc
  limit 100;
$$;

revoke all on function public.get_leaderboard(integer) from public;
grant execute on function public.get_leaderboard(integer) to authenticated;

comment on function public.get_leaderboard(integer) is
  'Ranks users by summed leaderboard_delta over the last p_window_days (clamped 1-60; Phase 1 UI uses 14/21/28/30). SECURITY DEFINER to aggregate across users; exposes only display fields + score.';

-- ===========================================================================
-- 8. Atomic, ledger-backed reward redemption. The ONLY path that spends points:
--    it appends a negative ledger event, decrements the cached balance, and
--    records the user_reward in one transaction. Client cannot write points.
-- ===========================================================================
create or replace function public.redeem_reward(p_reward_id uuid)
returns table (new_balance integer, user_reward_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_cost    integer;
  v_active  boolean;
  v_expiry  date;
  v_balance integer;
  v_ur_id   uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select points_cost, active, expiry_date
    into v_cost, v_active, v_expiry
  from public.rewards where id = p_reward_id;
  if v_cost is null then
    raise exception 'Reward not found';
  end if;
  if not v_active then
    raise exception 'This reward is no longer available';
  end if;
  if v_expiry is not null and v_expiry < current_date then
    raise exception 'This reward has expired';
  end if;
  if exists (select 1 from public.user_rewards where user_id = v_user and reward_id = p_reward_id) then
    raise exception 'You already redeemed this reward';
  end if;

  -- Lock the profile row so two concurrent redemptions cannot both pass the check.
  select points into v_balance from public.profiles where id = v_user for update;
  if v_balance is null then
    raise exception 'Your account profile is missing';
  end if;
  if v_balance < v_cost then
    raise exception 'Not enough points to redeem this reward';
  end if;

  -- Negative points event; leaderboard_delta stays 0 so spending never drops rank.
  insert into public.gamification_events
    (user_id, event_type, source_type, source_id, points_delta, leaderboard_delta, metadata)
  values
    (v_user, 'reward_redemption', 'reward', p_reward_id, -v_cost, 0,
     jsonb_build_object('reward_id', p_reward_id));

  update public.profiles
    set points = points - v_cost, updated_at = now()
    where id = v_user;

  insert into public.user_rewards (user_id, reward_id, points_spent)
    values (v_user, p_reward_id, v_cost)
    returning id into v_ur_id;

  select points into v_balance from public.profiles where id = v_user;
  return query select v_balance, v_ur_id;
end;
$$;

revoke all on function public.redeem_reward(uuid) from public;
grant execute on function public.redeem_reward(uuid) to authenticated;

comment on function public.redeem_reward(uuid) is
  'Atomic reward redemption: appends a negative points ledger event, decrements the cached balance under a row lock, and records the user_reward. The only spend path; the client cannot write points directly.';

-- ===========================================================================
-- 9. RLS for the new tables.
-- ===========================================================================
alter table public.gamification_rule_sets enable row level security;
alter table public.rewards enable row level security;
alter table public.user_rewards enable row level security;

-- Rule sets: read the system default + your own; create/update only your own.
create policy "read system and own rule sets"
  on public.gamification_rule_sets
  for select
  using (scope = 'system' or owner_user_id = auth.uid());

create policy "insert own rule sets"
  on public.gamification_rule_sets
  for insert
  with check (owner_user_id = auth.uid() and scope = 'individual');

create policy "update own rule sets"
  on public.gamification_rule_sets
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- Rewards catalog: any authenticated user can read it. Writes via service role.
create policy "read rewards catalog"
  on public.rewards
  for select
  using (true);

-- Redemptions: read your own. Inserts happen ONLY through redeem_reward() (no
-- client insert policy), so the points spend can never bypass the ledger.
create policy "read own redemptions"
  on public.user_rewards
  for select
  using (user_id = auth.uid());
