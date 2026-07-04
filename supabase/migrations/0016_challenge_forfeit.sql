-- Challenge forfeit: dropping an active challenge makes you the loser.
--
-- Forward-only and ADDITIVE on top of 0001-0015. It never edits earlier
-- migrations. It gives the challenge system its first real consequence: a
-- participant can DROP a challenge, but dropping an active (or not-yet-ended)
-- challenge is a FORFEIT — the dropper loses and is docked a fixed number of
-- league points from their leaderboard standing.
--
-- TRUST MODEL (mirrors redeem_reward in 0006 and the 0007 challenge RPCs):
--   * The penalty is a DERIVED, backend-owned write. leave_challenge() is the
--     ONLY path that can dock league points for a forfeit. The client physically
--     cannot write gamification_events (RLS is select-own only) nor the profile
--     counters (0005/0006 grant UPDATE on display columns only), so it can never
--     forge, skip, or shrink the penalty. The forfeit amount is a hardcoded
--     constant inside the SECURITY DEFINER function — never a client parameter.
--   * The forfeit appends a NEGATIVE leaderboard_delta ledger row, exactly like
--     every other score movement. get_leaderboard() sums leaderboard_delta over
--     its window, so a -N row lowers the dropper's standing. This is the SAME
--     trusted ledger the leaderboard already reads; nothing new to trust.
--
-- DELIBERATE, DOCUMENTED SEMANTICS:
--   * The penalty is a league-point (leaderboard_delta) hit, NOT a spendable-
--     points (profiles.points) hit. Dropping does not touch the rewards balance,
--     which also sidesteps the profiles_points_nonnegative floor. "Total
--     leaderboard standing" is precisely the sum this deducts from.
--   * Like every leaderboard movement, the -N ages out of the rolling window
--     (get_leaderboard clamps to the last N days). The forfeit is a real, visible
--     standing drop for the life of the window, consistent with how earned points
--     also decay. It is not a permanent all-time deduction.
--   * Because the ledger is global, an active-window forfeit also lowers the
--     dropper's DERIVED score in any OTHER challenge whose date window contains
--     now() (get_challenge_standings sums the same leaderboard_delta). That is
--     intended: a forfeit is a genuine league-point loss, not a per-challenge
--     bookkeeping trick.
--   * Dropping a challenge that has ALREADY ENDED costs nothing (returns 0). You
--     cannot "lose" a finished competition, and the UI does not offer it.
--   * The forfeit event carries source_id = NULL (challenge id lives in metadata)
--     so the 0005 partial unique index does not block a legitimate second forfeit
--     after a join → drop → rejoin → drop cycle.

-- ===========================================================================
-- 1. profiles.challenges_lost — the mirror of the existing challenges_won
--    counter (0005). Backend-owned: no UPDATE grant is added, so only SECURITY
--    DEFINER functions (this migration's leave_challenge) can move it.
-- ===========================================================================
alter table public.profiles
  add column challenges_lost integer not null default 0,
  add constraint profiles_challenges_lost_nonnegative check (challenges_lost >= 0);

comment on column public.profiles.challenges_lost is
  'Number of challenges the user forfeited by dropping them while active. Backend-owned; only leave_challenge() increments it.';

-- ===========================================================================
-- 2. Allow the new 'challenge_forfeit' event type. Same drop/re-add pattern 0006
--    used to widen this constraint; the full list must be restated. source_type
--    'challenge' is already permitted (0005), so it is unchanged.
-- ===========================================================================
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
    'challenge_forfeit',
    'reward_redemption',
    'manual_adjustment'
  ));

-- ===========================================================================
-- 3. leave_challenge(): drop the caller's membership and, if the challenge has
--    not ended, forfeit — dock a fixed league-point penalty and count a loss, all
--    in one transaction. Returns the league points deducted (0 for an ended
--    challenge). SECURITY DEFINER so the delete + penalty commit atomically as the
--    trusted actor.
-- ===========================================================================
create or replace function public.leave_challenge(p_challenge_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user      uuid := auth.uid();
  -- The forfeit cost. Hardcoded (never a client argument) so it cannot be gamed.
  v_penalty   constant integer := 20;
  v_is_member boolean;
  v_end       date;
  v_applied   integer := 0;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  -- Must actually be in the challenge to drop it.
  select true into v_is_member
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = v_user;
  if v_is_member is null then
    raise exception 'You are not in this challenge';
  end if;

  select end_date into v_end
  from public.challenges where id = p_challenge_id;
  if v_end is null then
    raise exception 'Challenge not found';
  end if;

  -- Remove the membership. RLS "leave as self" (0007) also permits this delete;
  -- doing it inside the function keeps it atomic with the penalty below.
  delete from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = v_user;

  -- Forfeit only if the challenge has NOT ended. Dropping a finished challenge is
  -- free (you cannot lose a competition that is already over).
  if current_date <= v_end then
    -- Negative league-point movement on the shared ledger. source_id is NULL so a
    -- later rejoin-then-drop is not blocked by the 0005 idempotency index.
    insert into public.gamification_events
      (user_id, event_type, source_type, source_id, xp_delta, points_delta,
       leaderboard_delta, metadata)
    values
      (v_user, 'challenge_forfeit', 'challenge', null, 0, 0,
       -v_penalty,
       jsonb_build_object('challenge_id', p_challenge_id, 'penalty', v_penalty));

    update public.profiles
      set challenges_lost = challenges_lost + 1,
          updated_at = now()
      where id = v_user;

    v_applied := v_penalty;
  end if;

  return v_applied;
end;
$$;

revoke all on function public.leave_challenge(uuid) from public;
grant execute on function public.leave_challenge(uuid) to authenticated;

comment on function public.leave_challenge(uuid) is
  'Drops the caller from a challenge. If the challenge has not ended, it is a forfeit: appends a negative leaderboard_delta ledger row (fixed penalty) and increments challenges_lost, atomically with the membership delete. Returns the league points deducted (0 if the challenge already ended). The only path that can dock forfeit points; the penalty is a hardcoded constant, never a client argument.';
