-- Repeatable gamification test script for migration 0005.
--
-- HOW TO RUN (local Supabase / psql):
--   supabase db reset            # applies 0001..0005 (and seed if present)
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0005_gamification_test.sql
--
-- This script is self-contained and transactional: it runs inside a single
-- transaction and ROLLS BACK at the end, so it leaves no test data behind and
-- can be run repeatedly. It uses RAISE EXCEPTION on any failed assertion, so a
-- non-zero exit / visible error means a test failed.
--
-- It deliberately seeds auth.users + profiles directly (service-role context) to
-- exercise the meal_logs INSERT trigger. Inserting into meal_logs is the ONLY
-- client-facing write; everything else (ledger, daily activity, counters) must be
-- produced by the trigger. The final block also asserts the privilege lockdown:
-- the `authenticated` role cannot UPDATE profiles.points.

begin;

-- Quiet down notices for cleaner output.
set local client_min_messages = warning;

do $$
declare
  -- Two users in two timezones so we can exercise the local-day boundary.
  u_ny   uuid := '00000000-0000-4000-8000-000000000001';  -- America/New_York
  u_la   uuid := '00000000-0000-4000-8000-000000000002';  -- America/Los_Angeles

  v_xp           integer;
  v_points       integer;
  v_streak       integer;
  v_longest      integer;
  v_meals        integer;
  v_event_count  integer;
  v_day_count    integer;
  v_meal_count   integer;
begin
  -- ----- Seed two profiles (FK target for meal_logs + timezone source). -----
  -- auth.users rows are required because profiles.id FKs auth.users.
  insert into auth.users (id, email, instance_id, aud, role)
  values
    (u_ny, 'ny@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_la, 'la@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  on conflict (id) do nothing;

  -- The 0001/0004 trigger may auto-create profiles; upsert timezone/username so
  -- the test is deterministic regardless of trigger presence.
  insert into public.profiles (id, username, timezone)
  values
    (u_ny, 'tz_ny_user', 'America/New_York'),
    (u_la, 'tz_la_user', 'America/Los_Angeles')
  on conflict (id) do update set timezone = excluded.timezone;

  ------------------------------------------------------------------------------
  -- TEST 1: first meal ever -> +50 XP, +10 pts, streak 1, 1 ledger row.
  ------------------------------------------------------------------------------
  insert into public.meal_logs
    (user_id, free_text, calories, protein_g, carbs_g, fat_g, quantity, meal_type, eaten_at, client_request_id, source)
  values
    (u_ny, 'oatmeal', 300, 10, 50, 5, 1, 'breakfast',
     timestamptz '2026-06-10 13:00:00+00', gen_random_uuid(), 'manual');

  select xp, points, streak_count, longest_streak, total_meals_logged
    into v_xp, v_points, v_streak, v_longest, v_meals
  from public.profiles where id = u_ny;

  if v_xp <> 50 or v_points <> 10 or v_streak <> 1 or v_longest <> 1 or v_meals <> 1 then
    raise exception 'TEST 1 FAILED: expected xp=50 pts=10 streak=1 longest=1 meals=1, got xp=% pts=% streak=% longest=% meals=%',
      v_xp, v_points, v_streak, v_longest, v_meals;
  end if;
  raise notice 'TEST 1 ok: first meal ever';

  ------------------------------------------------------------------------------
  -- TEST 2: second meal SAME local day -> XP/points/meals rise, streak unchanged.
  -- 2026-06-10 23:00 UTC is still 2026-06-10 in New York (19:00 EDT).
  ------------------------------------------------------------------------------
  insert into public.meal_logs
    (user_id, free_text, calories, protein_g, carbs_g, fat_g, quantity, meal_type, eaten_at, client_request_id, source)
  values
    (u_ny, 'chicken', 400, 40, 10, 12, 1, 'dinner',
     timestamptz '2026-06-10 23:00:00+00', gen_random_uuid(), 'user_estimate');

  select xp, points, streak_count, total_meals_logged into v_xp, v_points, v_streak, v_meals
  from public.profiles where id = u_ny;
  select meal_count into v_meal_count
  from public.user_daily_activity where user_id = u_ny and activity_date = date '2026-06-10';

  if v_xp <> 100 or v_points <> 20 or v_streak <> 1 or v_meals <> 2 or v_meal_count <> 2 then
    raise exception 'TEST 2 FAILED: expected xp=100 pts=20 streak=1 meals=2 day_meal_count=2, got xp=% pts=% streak=% meals=% day=%',
      v_xp, v_points, v_streak, v_meals, v_meal_count;
  end if;
  raise notice 'TEST 2 ok: second meal same day (meal_count++, streak flat)';

  ------------------------------------------------------------------------------
  -- TEST 3: meal on the CONSECUTIVE day -> streak 2, longest 2.
  ------------------------------------------------------------------------------
  insert into public.meal_logs
    (user_id, free_text, calories, protein_g, carbs_g, fat_g, quantity, meal_type, eaten_at, client_request_id, source)
  values
    (u_ny, 'eggs', 200, 18, 2, 14, 1, 'breakfast',
     timestamptz '2026-06-11 13:00:00+00', gen_random_uuid(), 'manual');

  select streak_count, longest_streak into v_streak, v_longest
  from public.profiles where id = u_ny;
  if v_streak <> 2 or v_longest <> 2 then
    raise exception 'TEST 3 FAILED: expected streak=2 longest=2, got streak=% longest=%', v_streak, v_longest;
  end if;
  raise notice 'TEST 3 ok: consecutive day increments streak';

  ------------------------------------------------------------------------------
  -- TEST 4: meal after a MISSED day -> streak resets to 1, longest stays 2.
  -- Skip 2026-06-12; next meal is 2026-06-13.
  ------------------------------------------------------------------------------
  insert into public.meal_logs
    (user_id, free_text, calories, protein_g, carbs_g, fat_g, quantity, meal_type, eaten_at, client_request_id, source)
  values
    (u_ny, 'salad', 250, 8, 20, 15, 1, 'lunch',
     timestamptz '2026-06-13 13:00:00+00', gen_random_uuid(), 'manual');

  select streak_count, longest_streak into v_streak, v_longest
  from public.profiles where id = u_ny;
  if v_streak <> 1 or v_longest <> 2 then
    raise exception 'TEST 4 FAILED: expected streak=1 longest=2, got streak=% longest=%', v_streak, v_longest;
  end if;
  raise notice 'TEST 4 ok: gap resets streak, longest is a high-water mark';

  ------------------------------------------------------------------------------
  -- TEST 5: timezone boundary. For the LA user, 2026-06-14 02:00 UTC is still
  -- 2026-06-13 in Los Angeles (19:00 PDT), and 2026-06-14 20:00 UTC is
  -- 2026-06-14 (13:00 PDT). So these are TWO consecutive local days -> streak 2,
  -- even though both instants share neither the same UTC date pairing naively.
  ------------------------------------------------------------------------------
  insert into public.meal_logs
    (user_id, free_text, calories, protein_g, carbs_g, fat_g, quantity, meal_type, eaten_at, client_request_id, source)
  values
    (u_la, 'burrito', 700, 30, 80, 25, 1, 'dinner',
     timestamptz '2026-06-14 02:00:00+00', gen_random_uuid(), 'manual');  -- 2026-06-13 local
  insert into public.meal_logs
    (user_id, free_text, calories, protein_g, carbs_g, fat_g, quantity, meal_type, eaten_at, client_request_id, source)
  values
    (u_la, 'bowl', 600, 35, 60, 20, 1, 'lunch',
     timestamptz '2026-06-14 20:00:00+00', gen_random_uuid(), 'manual');  -- 2026-06-14 local

  select streak_count into v_streak from public.profiles where id = u_la;
  select count(*) into v_day_count from public.user_daily_activity where user_id = u_la;
  if v_streak <> 2 or v_day_count <> 2 then
    raise exception 'TEST 5 FAILED (tz boundary): expected streak=2 over 2 local days, got streak=% days=%',
      v_streak, v_day_count;
  end if;
  raise notice 'TEST 5 ok: timezone boundary splits local days correctly';

  ------------------------------------------------------------------------------
  -- TEST 6: duplicate client_request_id -> insert blocked, NOTHING awarded twice.
  ------------------------------------------------------------------------------
  declare
    dup_req uuid := gen_random_uuid();
  begin
    insert into public.meal_logs
      (user_id, free_text, calories, protein_g, carbs_g, fat_g, quantity, meal_type, eaten_at, client_request_id, source)
    values
      (u_ny, 'shake', 220, 40, 8, 4, 1, 'snack',
       timestamptz '2026-06-13 18:00:00+00', dup_req, 'manual');

    select xp into v_xp from public.profiles where id = u_ny;  -- snapshot after the real insert

    -- Retry with the SAME client_request_id: meal_logs_idempotency rejects it.
    begin
      insert into public.meal_logs
        (user_id, free_text, calories, protein_g, carbs_g, fat_g, quantity, meal_type, eaten_at, client_request_id, source)
      values
        (u_ny, 'shake', 220, 40, 8, 4, 1, 'snack',
         timestamptz '2026-06-13 18:00:00+00', dup_req, 'manual');
      raise exception 'TEST 6 FAILED: duplicate client_request_id insert should have been rejected';
    exception when unique_violation then
      null;  -- expected
    end;

    select xp into v_points from public.profiles where id = u_ny;  -- reuse v_points as "after"
    if v_points <> v_xp then
      raise exception 'TEST 6 FAILED: XP changed on duplicate request (% -> %)', v_xp, v_points;
    end if;
  end;
  raise notice 'TEST 6 ok: duplicate request awards nothing twice';

  ------------------------------------------------------------------------------
  -- TEST 7: manual vs assisted meals earn the SAME base award. Compare the two
  -- ledger rows we already created on 2026-06-10 (manual + user_estimate).
  ------------------------------------------------------------------------------
  select count(*) into v_event_count
  from public.gamification_events
  where user_id = u_ny
    and event_type = 'meal_logged'
    and xp_delta = 50 and points_delta = 10;
  if v_event_count < 2 then
    raise exception 'TEST 7 FAILED: expected manual & assisted to both award 50/10, found % such rows', v_event_count;
  end if;
  raise notice 'TEST 7 ok: manual and assisted meals earn the same base award';

  ------------------------------------------------------------------------------
  -- TEST 8: failed insert awards nothing. A check-constraint violation
  -- (negative calories) must roll the whole statement back, including any award.
  ------------------------------------------------------------------------------
  select xp into v_xp from public.profiles where id = u_la;
  begin
    insert into public.meal_logs
      (user_id, free_text, calories, protein_g, carbs_g, fat_g, quantity, meal_type, eaten_at, client_request_id, source)
    values
      (u_la, 'bad', -5, 10, 10, 10, 1, 'lunch',
       timestamptz '2026-06-15 20:00:00+00', gen_random_uuid(), 'manual');
    raise exception 'TEST 8 FAILED: negative-calorie meal should have been rejected';
  exception when check_violation then
    null;  -- expected
  end;
  select xp into v_points from public.profiles where id = u_la;
  if v_points <> v_xp then
    raise exception 'TEST 8 FAILED: XP moved on a failed insert (% -> %)', v_xp, v_points;
  end if;
  raise notice 'TEST 8 ok: failed insert awards nothing';

  raise notice 'ALL TRIGGER TESTS PASSED';
end $$;

------------------------------------------------------------------------------
-- TEST 9: the `authenticated` client role CANNOT write arbitrary points.
-- Run as authenticated with a JWT claim for u_ny, then attempt to bump points.
-- The column-level grant lockdown must make this fail with insufficient_privilege.
------------------------------------------------------------------------------
do $$
declare
  u_ny uuid := '00000000-0000-4000-8000-000000000001';
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u_ny::text, 'role', 'authenticated')::text, true);

  begin
    update public.profiles set points = points + 1000000 where id = u_ny;
    reset role;
    raise exception 'TEST 9 FAILED: authenticated role was able to UPDATE profiles.points';
  exception when insufficient_privilege then
    reset role;
    raise notice 'TEST 9 ok: client cannot write points (insufficient_privilege)';
  end;
end $$;

-- Leave no trace; the script is repeatable.
rollback;
