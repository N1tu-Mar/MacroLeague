-- Functional test for migration 0011 (friendships + challenge invites).
-- Repeatable: wrapped in begin/rollback, so it asserts behavior and leaves no data.
-- Run against the linked remote with:
--   npx supabase db query --linked -f supabase/tests/0011_friendships_test.sql
-- A clean run prints "ALL FRIENDSHIP + INVITE TESTS PASSED" and no ERROR.

begin;
set local client_min_messages = warning;

do $$
declare
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
  v_status    text;
  v_cnt       int;
  v_challenge uuid;
  v_invite    uuid;
begin
  -- Two synthetic users; the handle_new_user trigger seeds their profiles.
  insert into auth.users (id, email, instance_id, aud, role) values
    (u1, 'fr-u1@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u2, 'fr-u2@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update public.profiles set display_name = 'Alice Test' where id = u1;
  update public.profiles set display_name = 'Bob Test'   where id = u2;

  -- ── As Alice (u1) ──────────────────────────────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u1::text, 'role', 'authenticated')::text, true);

  select friendship_status into v_status from public.search_users('Bob') where user_id = u2;
  assert v_status = 'none', 'search before request: expected none, got ' || coalesce(v_status, '<null>');

  v_status := public.send_friend_request(u2);
  assert v_status = 'outgoing', 'send_friend_request: expected outgoing, got ' || v_status;

  select friendship_status into v_status from public.search_users('Bob') where user_id = u2;
  assert v_status = 'outgoing', 'search after request: expected outgoing, got ' || coalesce(v_status, '<null>');

  reset role;

  -- ── As Bob (u2): see + accept the request ──────────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u2::text, 'role', 'authenticated')::text, true);

  select count(*) into v_cnt from public.get_friend_requests() where user_id = u1;
  assert v_cnt = 1, 'get_friend_requests: expected 1, got ' || v_cnt;

  v_status := public.respond_friend_request(u1, true);
  assert v_status = 'friends', 'respond_friend_request: expected friends, got ' || v_status;

  select count(*) into v_cnt from public.get_friends() where user_id = u1;
  assert v_cnt = 1, 'get_friends: expected 1, got ' || v_cnt;

  -- Friends board includes BOTH (caller + friend) even at zero score.
  select count(*) into v_cnt from public.get_friends_leaderboard(14);
  assert v_cnt = 2, 'get_friends_leaderboard: expected 2, got ' || v_cnt;

  reset role;

  -- ── As Alice: create a challenge and invite Bob ────────────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u1::text, 'role', 'authenticated')::text, true);

  v_challenge := public.create_challenge('Test Cup', 'solo', 'points', 7, 'Bragging rights');
  v_invite := public.invite_to_challenge(v_challenge, u2);
  assert v_invite is not null, 'invite_to_challenge returned null';

  reset role;

  -- ── As Bob: see the invite and accept (auto-join) ──────────────
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u2::text, 'role', 'authenticated')::text, true);

  select count(*) into v_cnt from public.get_challenge_invites() where challenge_id = v_challenge;
  assert v_cnt = 1, 'get_challenge_invites: expected 1, got ' || v_cnt;

  perform public.respond_challenge_invite(v_invite, true);

  reset role;

  -- Accepting the invite must have enrolled Bob in the challenge.
  select count(*) into v_cnt from public.challenge_participants
   where challenge_id = v_challenge and user_id = u2;
  assert v_cnt = 1, 'auto-join on accept: expected u2 enrolled, got ' || v_cnt;

  raise notice 'ALL FRIENDSHIP + INVITE TESTS PASSED';
end $$;

rollback;
