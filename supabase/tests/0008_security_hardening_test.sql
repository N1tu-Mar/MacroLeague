-- Repeatable test for migration 0008 (security hardening).
--
-- HOW TO RUN
--   * Local:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0008_security_hardening_test.sql
--   * Hosted: paste this whole file into the Supabase SQL Editor and Run.
--
-- Self-contained and transactional: everything runs in ONE transaction that ROLLS
-- BACK at the end, leaving no data behind. A failed assertion RAISEs, so a visible
-- error == a failed test; "ALL 0008 HARDENING TESTS PASSED" == success.
--
-- It proves the economy-escalation hole is closed: a user who writes a malicious
-- own rule set (huge amounts, trivial thresholds) still receives ONLY the trusted
-- SYSTEM amounts, and a user can DISABLE a module for themselves but cannot inflate.

begin;
set local client_min_messages = warning;

do $$
declare
  -- Attacker: writes a malicious personal rule set, then logs one meal.
  u_attack uuid := 'cccccccc-0000-4000-8000-000000000008';
  -- Disabler: disables the protein module for themselves, then hits protein goal.
  u_off    uuid := 'dddddddd-0000-4000-8000-000000000008';

  v_xp        integer;
  v_points    integer;
  v_lb        bigint;
  v_prot_evt  integer;
  v_mc_evt    integer;
begin
  insert into auth.users (id, email, instance_id, aud, role)
  values
    (u_attack, 'attack@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_off,    'optout@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  on conflict (id) do nothing;

  insert into public.profiles
    (id, username, timezone, goal_calories, goal_protein_g, goal_carbs_g, goal_unsaturated_fat_g, goal_trans_fat_g)
  values
    (u_attack, 'attacker_8', 'America/New_York', 2000, 100, 200, 60, 0),
    (u_off,    'optout_8',   'America/New_York', 2000, 100, 200, 60, 0)
  on conflict (id) do update set timezone = excluded.timezone;

  --------------------------------------------------------------------------------
  -- TEST 1: malicious personal rule set cannot inflate awards. The attacker sets
  -- absurd amounts and trivial thresholds (per_meal 1e6, meal_count.required 1,
  -- protein min_pct 0). After ONE meal they must still receive only the SYSTEM
  -- base award (xp 50, points 10, leaderboard 10) and NO meal_count bonus (the
  -- effective required stays at the system floor of 3, so 1 meal is not enough).
  --------------------------------------------------------------------------------
  insert into public.gamification_rule_sets
    (owner_user_id, scope, name, duration_days, is_default, rules)
  values
    (u_attack, 'individual', 'Evil Rules', 14, true, jsonb_build_object(
      'xp',          jsonb_build_object('per_meal', 1000000),
      'points',      jsonb_build_object('per_meal', 1000000, 'meal_count_goal', 1000000,
                                        'protein_goal', 1000000, 'macro_accuracy', 1000000,
                                        'streak_milestone', 1000000),
      'leaderboard', jsonb_build_object('per_meal', 1000000, 'meal_count_goal', 1000000,
                                        'protein_goal', 1000000, 'macro_accuracy', 1000000,
                                        'streak_milestone', 1000000),
      'meal_count',  jsonb_build_object('enabled', true, 'required', 1),
      'protein_goal',jsonb_build_object('enabled', true, 'min_pct', 0),
      'macro_accuracy', jsonb_build_object('enabled', false),
      'streak',      jsonb_build_object('enabled', true, 'milestones', jsonb_build_array(1))
    ));

  -- A single low-protein meal (protein 5 << goal 100, so even the real protein rule
  -- would not fire; we are checking the attacker can't fire it via min_pct=0).
  insert into public.meal_logs
    (user_id, free_text, calories, protein_g, carbs_g, fat_g, quantity, meal_type, eaten_at, client_request_id, source)
  values
    (u_attack, 'one meal', 300, 5, 20, 10, 1, 'breakfast',
     timestamptz '2026-06-10 13:00:00+00', gen_random_uuid(), 'manual');

  select xp, points into v_xp, v_points from public.profiles where id = u_attack;
  select coalesce(score, 0) into v_lb from public.get_leaderboard(14) where user_id = u_attack;
  select count(*) into v_mc_evt   from public.gamification_events where user_id = u_attack and event_type = 'meal_count_goal_hit';
  select count(*) into v_prot_evt from public.gamification_events where user_id = u_attack and event_type = 'daily_protein_goal_hit';

  if v_xp <> 50 or v_points <> 10 then
    raise exception 'TEST 1 FAILED: attacker got xp=% points=% (expected system base 50/10) — economy escalation NOT closed', v_xp, v_points;
  end if;
  if v_lb <> 10 then
    raise exception 'TEST 1 FAILED: attacker leaderboard score=% (expected 10) — leaderboard inflation NOT closed', v_lb;
  end if;
  if v_mc_evt <> 0 then
    raise exception 'TEST 1 FAILED: attacker fired meal_count bonus on 1 meal — threshold relax NOT blocked';
  end if;
  if v_prot_evt <> 0 then
    raise exception 'TEST 1 FAILED: attacker fired protein bonus via min_pct=0 — threshold relax NOT blocked';
  end if;
  raise notice 'TEST 1 ok: malicious rule set yields only system base award (xp 50 / pts 10 / lb 10), no relaxed bonuses';

  --------------------------------------------------------------------------------
  -- TEST 2: a user CAN still disable a module for themselves. u_off disables the
  -- protein module, then logs a meal that meets the protein goal (protein 120 >=
  -- 100). The protein bonus must NOT fire, proving user toggles still narrow.
  --------------------------------------------------------------------------------
  insert into public.gamification_rule_sets
    (owner_user_id, scope, name, duration_days, is_default, rules)
  values
    (u_off, 'individual', 'My Rules', 14, true, jsonb_build_object(
      'protein_goal', jsonb_build_object('enabled', false, 'min_pct', 100)
    ));

  insert into public.meal_logs
    (user_id, free_text, calories, protein_g, carbs_g, fat_g, quantity, meal_type, eaten_at, client_request_id, source)
  values
    (u_off, 'big protein', 800, 120, 80, 20, 1, 'lunch',
     timestamptz '2026-06-10 17:00:00+00', gen_random_uuid(), 'manual');

  select count(*) into v_prot_evt from public.gamification_events where user_id = u_off and event_type = 'daily_protein_goal_hit';
  if v_prot_evt <> 0 then
    raise exception 'TEST 2 FAILED: protein bonus fired despite user disabling the module (got % events)', v_prot_evt;
  end if;

  -- Base award still applies (the user only disabled one optional module).
  select xp, points into v_xp, v_points from public.profiles where id = u_off;
  if v_xp <> 50 or v_points <> 10 then
    raise exception 'TEST 2 FAILED: expected base xp 50 / pts 10 for opt-out user, got xp=% pts=%', v_xp, v_points;
  end if;
  raise notice 'TEST 2 ok: a user can disable a module for themselves (base award unaffected)';

  raise notice 'ALL 0008 HARDENING TESTS PASSED';
end $$;

rollback;
