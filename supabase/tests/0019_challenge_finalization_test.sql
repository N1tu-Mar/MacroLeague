-- Repeatable test for migration 0019 (challenge finalization).
--
-- Self-contained and transactional: everything runs inside ONE transaction that
-- ROLLS BACK at the end, so it leaves NO data behind and is safe to run against
-- any database (including production) via:
--   npx supabase db query --linked -f supabase/tests/0019_challenge_finalization_test.sql
-- A failed assertion RAISEs (visible error == failed test); the final
-- "ALL FINALIZATION TESTS PASSED" notice == success.
--
-- Ledger rows are inserted directly (rather than via meal_logs) so their
-- occurred_at can be placed inside a challenge window that is already in the
-- past — the meal trigger always stamps occurred_at = now().

begin;
set local client_min_messages = warning;

do $$
declare
  -- Distinct first-8-hex-char prefixes: handle_new_user() derives a profile
  -- username from substr(id::text, 1, 8), so a shared prefix would collide.
  u1 uuid := 'fe010000-0000-4000-8000-000000000001';  -- challenge A winner
  u2 uuid := 'fe020000-0000-4000-8000-000000000002';  -- challenge A runner-up
  u3 uuid := 'fe030000-0000-4000-8000-000000000003';  -- challenge C, tied
  u4 uuid := 'fe040000-0000-4000-8000-000000000004';  -- challenge C, tied

  v_cid_a uuid := 'ffffffff-0000-4000-8000-00000000000a';  -- ended, has a winner
  v_cid_b uuid := 'ffffffff-0000-4000-8000-00000000000b';  -- not yet ended
  v_cid_c uuid := 'ffffffff-0000-4000-8000-00000000000c';  -- ended, tied (draw)

  v_xp_before     integer;
  v_points_before integer;
  v_xp_after      integer;
  v_points_after  integer;
  v_won           integer;

  v_already boolean;
  v_draw    boolean;
  v_winner  uuid;
  v_score   bigint;

  v_win_events integer;
  v_caught     boolean;
begin
  -- Seed auth.users + profiles.
  insert into auth.users (id, email, instance_id, aud, role)
  values
    (u1, 'fin1@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u2, 'fin2@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u3, 'fin3@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u4, 'fin4@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  on conflict (id) do nothing;

  insert into public.profiles
    (id, username, timezone, goal_calories, goal_protein_g, goal_carbs_g, goal_unsaturated_fat_g, goal_trans_fat_g)
  values
    (u1, 'fin_u1', 'America/New_York', 2000, 100, 200, 60, 0),
    (u2, 'fin_u2', 'America/New_York', 2000, 100, 200, 60, 0),
    (u3, 'fin_u3', 'America/New_York', 2000, 100, 200, 60, 0),
    (u4, 'fin_u4', 'America/New_York', 2000, 100, 200, 60, 0)
  on conflict (id) do nothing;

  -- Challenge A: ended 3 days ago, u1 (40) beats u2 (10).
  insert into public.challenges
    (id, created_by, name, type, goal_type, duration_days, start_date, end_date)
  values
    (v_cid_a, u1, 'Finalize Winner', 'team', 'points', 7, current_date - 10, current_date - 3);
  insert into public.challenge_participants (challenge_id, user_id, team_name) values
    (v_cid_a, u1, 'My Team'),
    (v_cid_a, u2, 'My Team');
  insert into public.gamification_events
    (user_id, event_type, source_type, source_id, leaderboard_delta, occurred_at) values
    (u1, 'meal_logged', 'meal_log', gen_random_uuid(), 20, current_date - 8),
    (u1, 'meal_logged', 'meal_log', gen_random_uuid(), 20, current_date - 7),
    (u2, 'meal_logged', 'meal_log', gen_random_uuid(), 10, current_date - 8);

  -- Challenge B: not yet ended.
  insert into public.challenges
    (id, created_by, name, type, goal_type, duration_days, start_date, end_date)
  values
    (v_cid_b, u1, 'Finalize Too Early', 'solo', 'points', 7, current_date, current_date + 7);
  insert into public.challenge_participants (challenge_id, user_id, team_name) values
    (v_cid_b, u1, 'Solo');

  -- Challenge C: ended, u3 and u4 tied at 15 => draw.
  insert into public.challenges
    (id, created_by, name, type, goal_type, duration_days, start_date, end_date)
  values
    (v_cid_c, u3, 'Finalize Draw', 'team', 'points', 7, current_date - 10, current_date - 3);
  insert into public.challenge_participants (challenge_id, user_id, team_name) values
    (v_cid_c, u3, 'My Team'),
    (v_cid_c, u4, 'My Team');
  insert into public.gamification_events
    (user_id, event_type, source_type, source_id, leaderboard_delta, occurred_at) values
    (u3, 'meal_logged', 'meal_log', gen_random_uuid(), 15, current_date - 8),
    (u4, 'meal_logged', 'meal_log', gen_random_uuid(), 15, current_date - 8);

  ------------------------------------------------------------------------------
  -- TEST 1: finalizing a not-yet-ended challenge is refused.
  ------------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u1::text, 'role', 'authenticated')::text, true);

  v_caught := false;
  begin
    perform public.finalize_challenge(v_cid_b);
  exception when others then
    v_caught := true;
  end;

  reset role;

  if not v_caught then
    raise exception 'TEST 1 FAILED: finalizing an active challenge should have raised';
  end if;
  raise notice 'TEST 1 ok: an active challenge cannot be finalized';

  ------------------------------------------------------------------------------
  -- TEST 2: finalizing challenge A derives u1 as the winner and awards them.
  ------------------------------------------------------------------------------
  select xp, points into v_xp_before, v_points_before from public.profiles where id = u1;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u2::text, 'role', 'authenticated')::text, true);

  select already_finalized, is_draw, winner_user_id, top_score
    into v_already, v_draw, v_winner, v_score
  from public.finalize_challenge(v_cid_a);

  reset role;

  if v_already or v_draw or v_winner <> u1 or v_score <> 40 then
    raise exception 'TEST 2 FAILED: expected fresh non-draw win for u1 at score 40, got already=% draw=% winner=% score=%',
      v_already, v_draw, v_winner, v_score;
  end if;

  if not exists (select 1 from public.challenges where id = v_cid_a and finalized_at is not null) then
    raise exception 'TEST 2 FAILED: challenges.finalized_at was not set';
  end if;
  if not exists (
    select 1 from public.challenge_results
    where challenge_id = v_cid_a and winner_user_id = u1 and not is_draw and top_score = 40
  ) then
    raise exception 'TEST 2 FAILED: challenge_results row missing/incorrect';
  end if;

  select xp, points into v_xp_after, v_points_after from public.profiles where id = u1;
  select challenges_won into v_won from public.profiles where id = u1;
  if v_xp_after - v_xp_before <> 100 or v_points_after - v_points_before <> 100 or v_won <> 1 then
    raise exception 'TEST 2 FAILED: expected +100 xp, +100 points, challenges_won=1, got dxp=% dpoints=% won=%',
      v_xp_after - v_xp_before, v_points_after - v_points_before, v_won;
  end if;

  select count(*) into v_win_events
  from public.gamification_events
  where user_id = u1 and event_type = 'challenge_win' and source_type = 'challenge' and source_id = v_cid_a;
  if v_win_events <> 1 then
    raise exception 'TEST 2 FAILED: expected exactly 1 challenge_win event, got %', v_win_events;
  end if;
  raise notice 'TEST 2 ok: challenge A finalized, u1 derived as winner and awarded once';

  ------------------------------------------------------------------------------
  -- TEST 3: a repeat finalize call is idempotent — no double award.
  ------------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u1::text, 'role', 'authenticated')::text, true);

  select already_finalized, is_draw, winner_user_id, top_score
    into v_already, v_draw, v_winner, v_score
  from public.finalize_challenge(v_cid_a);

  reset role;

  if not v_already or v_draw or v_winner <> u1 or v_score <> 40 then
    raise exception 'TEST 3 FAILED: repeat call should report already_finalized with the same frozen result, got already=% draw=% winner=% score=%',
      v_already, v_draw, v_winner, v_score;
  end if;

  select challenges_won into v_won from public.profiles where id = u1;
  select xp, points into v_xp_after, v_points_after from public.profiles where id = u1;
  select count(*) into v_win_events
  from public.gamification_events
  where user_id = u1 and event_type = 'challenge_win' and source_type = 'challenge' and source_id = v_cid_a;
  if v_won <> 1 or v_xp_after - v_xp_before <> 100 or v_points_after - v_points_before <> 100 or v_win_events <> 1 then
    raise exception 'TEST 3 FAILED: repeat finalize must not re-award (won=% dxp=% dpoints=% events=%)',
      v_won, v_xp_after - v_xp_before, v_points_after - v_points_before, v_win_events;
  end if;
  raise notice 'TEST 3 ok: repeat finalize is a no-op, no double award';

  ------------------------------------------------------------------------------
  -- TEST 4: a tie for first place is a draw — no winner, no award.
  ------------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u3::text, 'role', 'authenticated')::text, true);

  select already_finalized, is_draw, winner_user_id, top_score
    into v_already, v_draw, v_winner, v_score
  from public.finalize_challenge(v_cid_c);

  reset role;

  if v_already or not v_draw or v_winner is not null or v_score <> 15 then
    raise exception 'TEST 4 FAILED: expected a draw at score 15 with no winner, got already=% draw=% winner=% score=%',
      v_already, v_draw, v_winner, v_score;
  end if;
  if not exists (
    select 1 from public.challenge_results
    where challenge_id = v_cid_c and is_draw and winner_user_id is null and top_score = 15
  ) then
    raise exception 'TEST 4 FAILED: challenge_results draw row missing/incorrect';
  end if;
  if exists (select 1 from public.profiles where id in (u3, u4) and challenges_won <> 0) then
    raise exception 'TEST 4 FAILED: a draw must not increment challenges_won';
  end if;
  if exists (
    select 1 from public.gamification_events
    where user_id in (u3, u4) and event_type = 'challenge_win' and source_id = v_cid_c
  ) then
    raise exception 'TEST 4 FAILED: a draw must not emit a challenge_win event';
  end if;
  raise notice 'TEST 4 ok: a tie for first place is a draw with no winner and no award';

  ------------------------------------------------------------------------------
  -- TEST 5: finalizing a nonexistent challenge is refused.
  ------------------------------------------------------------------------------
  v_caught := false;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u1::text, 'role', 'authenticated')::text, true);

  begin
    perform public.finalize_challenge(gen_random_uuid());
  exception when others then
    v_caught := true;
  end;

  reset role;

  if not v_caught then
    raise exception 'TEST 5 FAILED: finalizing a nonexistent challenge should have raised';
  end if;
  raise notice 'TEST 5 ok: a nonexistent challenge cannot be finalized';

  raise notice 'ALL FINALIZATION TESTS PASSED';
end $$;

rollback;
