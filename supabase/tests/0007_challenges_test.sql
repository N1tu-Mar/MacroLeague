-- Repeatable test for migration 0007 (challenges).
--
-- Self-contained and transactional: everything runs inside ONE transaction that
-- ROLLS BACK at the end, so it leaves NO data behind and is safe to run against
-- any database (including production) via:
--   npx supabase db query --linked -f supabase/tests/0007_challenges_test.sql
-- A failed assertion RAISEs (visible error == failed test); the final
-- "ALL CHALLENGE TESTS PASSED" notice == success.
--
-- It exercises ONLY client-facing paths (create_challenge RPC, participant
-- insert, meal_logs insert) and asserts the DATABASE derives standings/scores
-- from the trusted gamification_events ledger — never a client-sent score.

begin;
set local client_min_messages = warning;

do $$
declare
  u1 uuid := 'cccccccc-0000-4000-8000-000000000001';  -- creator
  u2 uuid := 'dddddddd-0000-4000-8000-000000000002';  -- joiner
  v_cid       uuid;
  v_parts     integer;
  v_goals     integer;
  v_s1        bigint;
  v_s2        bigint;
  v_rows      integer;
  v_first     uuid;
begin
  -- Seed auth.users + profiles with valid goals (so the award trigger runs).
  insert into auth.users (id, email, instance_id, aud, role)
  values
    (u1, 'chcreator@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u2, 'chjoiner@test.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  on conflict (id) do nothing;

  insert into public.profiles
    (id, username, timezone, goal_calories, goal_protein_g, goal_carbs_g, goal_unsaturated_fat_g, goal_trans_fat_g)
  values
    (u1, 'ch_creator', 'America/New_York', 2000, 100, 200, 60, 0),
    (u2, 'ch_joiner',  'America/New_York', 2000, 100, 200, 60, 0)
  on conflict (id) do nothing;

  ------------------------------------------------------------------------------
  -- TEST 1: create_challenge (as u1) makes the challenge + creator participant +
  -- a starter goal, atomically.
  ------------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u1::text, 'role', 'authenticated')::text, true);

  v_cid := public.create_challenge('Protein Week', 'team', 'protein', 7, 'Loser buys coffee');

  reset role;

  if v_cid is null then
    raise exception 'TEST 1 FAILED: create_challenge returned null';
  end if;
  select count(*) into v_parts from public.challenge_participants where challenge_id = v_cid;
  select count(*) into v_goals from public.challenge_goals where challenge_id = v_cid;
  if v_parts <> 1 or v_goals <> 1 then
    raise exception 'TEST 1 FAILED: expected 1 participant + 1 goal, got parts=% goals=%', v_parts, v_goals;
  end if;
  if not exists (select 1 from public.challenges where id = v_cid and created_by = u1 and type = 'team' and goal_type = 'protein') then
    raise exception 'TEST 1 FAILED: challenge row not created as expected';
  end if;
  raise notice 'TEST 1 ok: create_challenge made challenge + creator participant + goal';

  ------------------------------------------------------------------------------
  -- TEST 2: u2 joins as self; a duplicate join is rejected by the unique index.
  ------------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u2::text, 'role', 'authenticated')::text, true);

  insert into public.challenge_participants (challenge_id, user_id, team_name)
  values (v_cid, u2, 'My Team');

  begin
    insert into public.challenge_participants (challenge_id, user_id, team_name)
    values (v_cid, u2, 'My Team');
    reset role;
    raise exception 'TEST 2 FAILED: duplicate join should have been rejected';
  exception when unique_violation then
    null;  -- expected
  end;

  reset role;

  select count(*) into v_parts from public.challenge_participants where challenge_id = v_cid;
  if v_parts <> 2 then
    raise exception 'TEST 2 FAILED: expected 2 participants after join, got %', v_parts;
  end if;
  raise notice 'TEST 2 ok: join works once; duplicate join blocked';

  ------------------------------------------------------------------------------
  -- TEST 3: RLS — u2 cannot modify u1''s participant row.
  ------------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u2::text, 'role', 'authenticated')::text, true);

  update public.challenge_participants set team_name = 'hacked'
  where challenge_id = v_cid and user_id = u1;
  get diagnostics v_rows = row_count;

  reset role;

  if v_rows <> 0 then
    raise exception 'TEST 3 FAILED: u2 was able to update u1''s participant row (% rows)', v_rows;
  end if;
  raise notice 'TEST 3 ok: a user cannot edit another participant''s row';

  ------------------------------------------------------------------------------
  -- TEST 4: standings are DERIVED from the ledger. Log small meals (low macros so
  -- only the base +10 leaderboard award per meal fires): u1 logs 2, u2 logs 1.
  -- Expected window scores: u1 = 20, u2 = 10, u1 ranked first.
  ------------------------------------------------------------------------------
  insert into public.meal_logs (user_id, free_text, calories, protein_g, carbs_g, fat_g, quantity, meal_type, eaten_at, client_request_id, source) values
    (u1, 'snack', 100, 5, 10, 2, 1, 'snack', now(), gen_random_uuid(), 'manual'),
    (u1, 'snack', 100, 5, 10, 2, 1, 'snack', now(), gen_random_uuid(), 'manual'),
    (u2, 'snack', 100, 5, 10, 2, 1, 'snack', now(), gen_random_uuid(), 'manual');

  select score into v_s1 from public.get_challenge_standings(v_cid) where user_id = u1;
  select score into v_s2 from public.get_challenge_standings(v_cid) where user_id = u2;
  if v_s1 <> 20 or v_s2 <> 10 then
    raise exception 'TEST 4 FAILED: expected derived scores u1=20 u2=10, got u1=% u2=%', v_s1, v_s2;
  end if;

  select user_id into v_first from public.get_challenge_standings(v_cid) limit 1;
  if v_first <> u1 then
    raise exception 'TEST 4 FAILED: expected u1 ranked first, got %', v_first;
  end if;
  raise notice 'TEST 4 ok: standings derived from the ledger and ranked correctly';

  raise notice 'ALL CHALLENGE TESTS PASSED';
end $$;

rollback;
