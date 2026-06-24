-- Repeatable test for migration 0006 (Phase 1 rule engine).
--
-- HOW TO RUN
--   * Local:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0006_gamification_test.sql
--   * Hosted: paste this whole file into the Supabase SQL Editor and Run.
--
-- It is self-contained and transactional: everything happens inside ONE
-- transaction that ROLLS BACK at the end, so it leaves NO data behind and is safe
-- to run repeatedly against any database (including production). Any failed
-- assertion RAISEs, so a visible error == a failed test; "ALL PHASE 1 RULE TESTS
-- PASSED" at the end == success.
--
-- It exercises ONLY client-facing writes (meal_logs insert + the redeem_reward
-- RPC) and asserts that the DATABASE produced every derived value (ledger events,
-- daily-goal flags, counters, leaderboard score, redemption ledger).

begin;
set local client_min_messages = warning;

do $$
declare
  u   uuid := 'aaaaaaaa-0000-4000-8000-000000000001';  -- rule-modules user (NY)
  u2  uuid := 'bbbbbbbb-0000-4000-8000-000000000002';  -- streak-milestone user (NY)

  v_xp          integer;
  v_points      integer;
  v_meals       integer;
  v_streak      integer;
  v_count_evt   integer;
  v_prot_evt    integer;
  v_macro_evt   integer;
  v_milestone   integer;
  v_lb_score    bigint;
  i             integer;
begin
  -- Seed auth.users (FK target) + profiles with goals. Goals: 2000 cal / 100 P /
  -- 200 C (40% energy, valid) / 60 unsat fat. System default rule set applies.
  insert into auth.users (id, email, instance_id, aud, role)
  values
    (u,  'rules@test.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u2, 'streak@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  on conflict (id) do nothing;

  insert into public.profiles
    (id, username, timezone, goal_calories, goal_protein_g, goal_carbs_g, goal_unsaturated_fat_g, goal_trans_fat_g)
  values
    (u,  'rules_user',  'America/New_York', 2000, 100, 200, 60, 0),
    (u2, 'streak_user', 'America/New_York', 2000, 100, 200, 60, 0)
  on conflict (id) do update
    set timezone = excluded.timezone,
        goal_calories = excluded.goal_calories,
        goal_protein_g = excluded.goal_protein_g,
        goal_carbs_g = excluded.goal_carbs_g,
        goal_unsaturated_fat_g = excluded.goal_unsaturated_fat_g,
        goal_trans_fat_g = excluded.goal_trans_fat_g;

  --------------------------------------------------------------------------------
  -- TEST 1: three meals on one local day hit meal-count (3), protein (>=100), and
  -- macro-accuracy (cal/protein/carbs in band) — each exactly once.
  -- Totals after 3 meals: cal 2000, protein 120, carbs 200, fat 60.
  --------------------------------------------------------------------------------
  insert into public.meal_logs (user_id, free_text, calories, protein_g, carbs_g, fat_g, quantity, meal_type, eaten_at, client_request_id, source) values
    (u, 'meal a', 700, 40, 70, 20, 1, 'breakfast', timestamptz '2026-06-10 13:00:00+00', gen_random_uuid(), 'manual'),
    (u, 'meal b', 700, 40, 70, 20, 1, 'lunch',     timestamptz '2026-06-10 17:00:00+00', gen_random_uuid(), 'manual'),
    (u, 'meal c', 600, 40, 60, 20, 1, 'dinner',    timestamptz '2026-06-10 22:00:00+00', gen_random_uuid(), 'manual');

  select xp, points, total_meals_logged into v_xp, v_points, v_meals
  from public.profiles where id = u;

  -- XP = 3 * 50 = 150. Points = 3*10 (base) + 15 (meal_count) + 25 (protein) + 30 (macro) = 100.
  if v_xp <> 150 or v_points <> 100 or v_meals <> 3 then
    raise exception 'TEST 1 FAILED: expected xp=150 pts=100 meals=3, got xp=% pts=% meals=%', v_xp, v_points, v_meals;
  end if;

  select count(*) into v_count_evt from public.gamification_events where user_id = u and event_type = 'meal_count_goal_hit';
  select count(*) into v_prot_evt  from public.gamification_events where user_id = u and event_type = 'daily_protein_goal_hit';
  select count(*) into v_macro_evt from public.gamification_events where user_id = u and event_type = 'daily_macro_accuracy_hit';
  if v_count_evt <> 1 or v_prot_evt <> 1 or v_macro_evt <> 1 then
    raise exception 'TEST 1 FAILED: expected 1 each of count/protein/macro events, got count=% protein=% macro=%',
      v_count_evt, v_prot_evt, v_macro_evt;
  end if;
  raise notice 'TEST 1 ok: meal-count + protein + macro-accuracy each awarded once';

  --------------------------------------------------------------------------------
  -- TEST 2: a 4th meal the SAME day awards ONLY the base meal (+50/+10); the daily
  -- goals do not re-fire (flags guard once-per-local-day).
  --------------------------------------------------------------------------------
  insert into public.meal_logs (user_id, free_text, calories, protein_g, carbs_g, fat_g, quantity, meal_type, eaten_at, client_request_id, source) values
    (u, 'meal d', 300, 30, 20, 10, 1, 'snack', timestamptz '2026-06-10 23:30:00+00', gen_random_uuid(), 'manual');

  select xp, points into v_xp, v_points from public.profiles where id = u;
  select count(*) into v_count_evt from public.gamification_events where user_id = u and event_type = 'meal_count_goal_hit';
  select count(*) into v_prot_evt  from public.gamification_events where user_id = u and event_type = 'daily_protein_goal_hit';
  if v_xp <> 200 or v_points <> 110 or v_count_evt <> 1 or v_prot_evt <> 1 then
    raise exception 'TEST 2 FAILED: expected xp=200 pts=110 and daily events still 1/1, got xp=% pts=% count=% protein=%',
      v_xp, v_points, v_count_evt, v_prot_evt;
  end if;
  raise notice 'TEST 2 ok: daily goals award at most once per local day';

  --------------------------------------------------------------------------------
  -- TEST 3: streak milestone. Log one small meal per day for 7 consecutive local
  -- days (low macros so no daily goal fires). Day 7 -> streak_milestone (+100).
  --------------------------------------------------------------------------------
  for i in 0..6 loop
    insert into public.meal_logs (user_id, free_text, calories, protein_g, carbs_g, fat_g, quantity, meal_type, eaten_at, client_request_id, source) values
      (u2, 'snack', 100, 5, 10, 2, 1, 'snack',
       (timestamptz '2026-06-01 14:00:00+00') + (i || ' days')::interval, gen_random_uuid(), 'manual');
  end loop;

  select streak_count into v_streak from public.profiles where id = u2;
  select count(*) into v_milestone from public.gamification_events where user_id = u2 and event_type = 'streak_milestone';
  if v_streak <> 7 or v_milestone <> 1 then
    raise exception 'TEST 3 FAILED: expected streak=7 with 1 milestone event, got streak=% milestones=%', v_streak, v_milestone;
  end if;
  raise notice 'TEST 3 ok: 7-day streak fires exactly one streak_milestone';

  --------------------------------------------------------------------------------
  -- TEST 4: leaderboard ranks user u by summed leaderboard_delta. Expected score =
  -- 4*10 (meals) + 15 + 25 + 30 = 110.
  --------------------------------------------------------------------------------
  select score into v_lb_score from public.get_leaderboard(14) where user_id = u;
  if v_lb_score is null or v_lb_score <> 110 then
    raise exception 'TEST 4 FAILED: expected leaderboard score=110 for u, got %', v_lb_score;
  end if;
  raise notice 'TEST 4 ok: leaderboard score aggregates rule events';

  raise notice 'ALL TRIGGER-SIDE PHASE 1 RULE TESTS PASSED';
end $$;

--------------------------------------------------------------------------------
-- TEST 5: ledger-backed redemption via the redeem_reward RPC, run as the
-- authenticated client (JWT sub = u). It must spend points atomically, NOT change
-- the leaderboard score, and reject a second redemption + an unaffordable one.
--------------------------------------------------------------------------------
do $$
declare
  u uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  v_cheap uuid;
  v_expensive uuid;
  v_balance integer;
  v_new integer;
  v_lb bigint;
begin
  -- A cheap reward (50) u can afford, and an expensive one (999999) u cannot.
  insert into public.rewards (partner_name, description, points_cost, category)
  values ('Test Cheap', '50 pt test reward', 50, 'test') returning id into v_cheap;
  insert into public.rewards (partner_name, description, points_cost, category)
  values ('Test Expensive', 'too pricey', 999999, 'test') returning id into v_expensive;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u::text, 'role', 'authenticated')::text, true);

  select points into v_balance from public.profiles where id = u;  -- 110 from earlier

  select new_balance into v_new from public.redeem_reward(v_cheap);
  if v_new <> v_balance - 50 then
    reset role;
    raise exception 'TEST 5 FAILED: expected balance %, got % after redeeming 50', v_balance - 50, v_new;
  end if;

  -- Second redemption of the SAME reward must be rejected.
  begin
    perform public.redeem_reward(v_cheap);
    reset role;
    raise exception 'TEST 5 FAILED: second redemption of same reward should be rejected';
  exception when others then
    if sqlerrm not like '%already redeemed%' then
      reset role;
      raise exception 'TEST 5 FAILED: wrong error on double redeem: %', sqlerrm;
    end if;
  end;

  -- Unaffordable reward must be rejected.
  begin
    perform public.redeem_reward(v_expensive);
    reset role;
    raise exception 'TEST 5 FAILED: unaffordable redemption should be rejected';
  exception when others then
    if sqlerrm not like '%Not enough points%' then
      reset role;
      raise exception 'TEST 5 FAILED: wrong error on unaffordable redeem: %', sqlerrm;
    end if;
  end;

  reset role;

  -- Redemption is a negative POINTS event but leaderboard_delta = 0, so rank score
  -- must be unchanged (still 110).
  select score into v_lb from public.get_leaderboard(14) where user_id = u;
  if v_lb <> 110 then
    raise exception 'TEST 5 FAILED: leaderboard score changed after redemption (got %)', v_lb;
  end if;

  raise notice 'TEST 5 ok: redemption spends points atomically, blocks dupes/overspend, leaves score intact';
  raise notice 'ALL PHASE 1 RULE TESTS PASSED';
end $$;

rollback;
