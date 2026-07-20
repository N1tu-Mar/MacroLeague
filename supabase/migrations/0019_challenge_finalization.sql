-- Challenge finalization: derive and lock in a winner when a challenge ends.
--
-- Forward-only and ADDITIVE on top of 0001-0018. It never edits earlier
-- migrations. It closes the loop 0007 documented as deferred ("No
-- auto-finalization / winner declaration / challenge_win point award yet"):
-- once a challenge's window has closed, finalize_challenge() derives the
-- winner from the SAME trusted ledger get_challenge_standings already reads,
-- freezes it into challenge_results, and awards the winner exactly once.
--
-- TRUST MODEL (mirrors get_challenge_standings in 0007 and leave_challenge in 0016):
--   * The winner is DERIVED, never client-set. finalize_challenge() re-runs the
--     same sum(leaderboard_delta) over the challenge's [start_date, end_date]
--     window that get_challenge_standings uses to rank participants. There is no
--     client-writable "winner" column anywhere.
--   * Finalization is a backend-owned, SECURITY DEFINER write. The client cannot
--     insert into challenge_results (no insert policy) and cannot award itself
--     challenge_win points (gamification_events has no client insert policy).
--   * Idempotent, TWO independent ways:
--       1. The challenge row is locked (`for update`) and finalized_at checked
--          first. Once set, a repeat/concurrent call returns the frozen
--          challenge_results row without recomputing or re-awarding anything —
--          a later forfeit inside an already-finalized challenge's window can
--          never flip a settled result.
--       2. The challenge_win ledger insert also goes through the existing 0005
--          unique index (user_id, event_type, source_type, source_id) where
--          source_id is not null, a second, independent guarantee against a
--          double award.
--
-- DELIBERATE, DOCUMENTED SEMANTICS:
--   * Only a COMPLETED challenge (current_date > end_date, matching the client's
--     deriveStatus) can be finalized. Finalizing early is refused.
--   * A single winner is the participant with the strictly highest derived score.
--     A tie for first place (including an all-zero-score challenge with no
--     activity, or zero participants) is a DRAW: challenge_results.is_draw =
--     true, winner_user_id is null, and no points are awarded. This is the same
--     "team_name" limitation 0007 already has (team challenges do not yet split
--     into opposing teams — every participant lands in one team_name bucket per
--     create_challenge/joinChallenge), so Phase 1 finalization is deliberately
--     per-participant, not per-team.
--   * The win award is points_delta/xp_delta only (redeemable points + Rewards-
--     screen XP), plus profiles.challenges_won. leaderboard_delta is
--     intentionally 0: a challenge win happens AFTER the challenge's own scoring
--     window closes, but a nonzero leaderboard_delta would still count toward
--     OTHER overlapping challenges' and the global leaderboard's derived
--     windows, letting a win recursively inflate standings elsewhere.
--     profiles.challenges_won is the durable, visible trophy count instead.
--   * finalize_challenge() can be called by any authenticated user (not just a
--     participant) — same trust level as get_challenge_standings, since it only
--     ever reads the public ledger and writes a derived, idempotent result.

-- ===========================================================================
-- 1. challenges.finalized_at — set exactly once, by finalize_challenge().
-- ===========================================================================
alter table public.challenges
  add column finalized_at timestamptz;

comment on column public.challenges.finalized_at is
  'Set once by finalize_challenge() when the challenge''s result is locked in. Null until then. Backend-owned: the "update own challenges" policy lets the creator edit their challenge, but only finalize_challenge() (SECURITY DEFINER) ever sets this column.';

-- ===========================================================================
-- 2. challenge_results — one frozen row per finalized challenge.
-- ===========================================================================
create table public.challenge_results (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  winner_user_id uuid references public.profiles(id) on delete set null,
  is_draw boolean not null default false,
  top_score bigint not null default 0,
  finalized_at timestamptz not null default now(),
  constraint challenge_results_winner_xor_draw check (
    (is_draw and winner_user_id is null) or (not is_draw and winner_user_id is not null)
  )
);

create unique index challenge_results_challenge_unique on public.challenge_results (challenge_id);

comment on table public.challenge_results is
  'One frozen row per finalized challenge, written once by finalize_challenge(). winner_user_id is null iff is_draw (tie for first place, or zero participants).';

alter table public.challenge_results enable row level security;

-- Readable by anyone signed in, same as challenges/participants/goals. No
-- insert/update/delete policy: only finalize_challenge() (SECURITY DEFINER,
-- runs as table owner) can write this table, so clients are read-only.
create policy "read challenge results"
  on public.challenge_results
  for select
  using (true);

-- ===========================================================================
-- 3. finalize_challenge(): derive the winner, freeze the result, award the
--    winner once. SECURITY DEFINER so the read-across-participants + the
--    ledger award + the profiles counter commit atomically as the trusted actor.
-- ===========================================================================
create or replace function public.finalize_challenge(p_challenge_id uuid)
returns table (
  already_finalized boolean,
  is_draw boolean,
  winner_user_id uuid,
  winner_username text,
  winner_display_name text,
  top_score bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- The win award. Hardcoded (never a client argument) so it cannot be gamed.
  c_win_points constant integer := 100;
  c_win_xp     constant integer := 100;

  v_user            uuid := auth.uid();
  v_end             date;
  v_finalized       timestamptz;
  v_top_score       bigint;
  v_winner          uuid;
  v_winner_username text;
  v_winner_display  text;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  -- Lock the challenge row so a concurrent double-call serializes: the second
  -- call blocks here until the first commits, then observes finalized_at set
  -- and takes the idempotent early-return path below.
  select end_date, finalized_at into v_end, v_finalized
  from public.challenges
  where id = p_challenge_id
  for update;

  if v_end is null then
    raise exception 'Challenge not found';
  end if;

  if v_finalized is not null then
    select r.is_draw, r.winner_user_id, r.top_score, p.username, p.display_name
      into is_draw, winner_user_id, top_score, winner_username, winner_display_name
    from public.challenge_results r
    left join public.profiles p on p.id = r.winner_user_id
    where r.challenge_id = p_challenge_id;

    already_finalized := true;
    return next;
    return;
  end if;

  if current_date <= v_end then
    raise exception 'Challenge has not ended yet';
  end if;

  -- Same derivation get_challenge_standings uses: sum leaderboard_delta per
  -- participant over the challenge's UTC date window. The winner is whoever is
  -- alone at the top; a tie (or zero participants) is a draw.
  with standings as (
    select
      cp.user_id,
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
    where cp.challenge_id = p_challenge_id
  ),
  top as (
    select max(score) as top_score from standings
  ),
  tied as (
    select s.user_id
    from standings s, top t
    where s.score = t.top_score
  )
  select t.top_score, case when (select count(*) from tied) = 1 then (select user_id from tied) else null end
    into v_top_score, v_winner
  from top t;

  if v_top_score is null then
    -- No participants at all: a draw with score 0.
    v_top_score := 0;
    v_winner := null;
  end if;

  insert into public.challenge_results (challenge_id, winner_user_id, is_draw, top_score)
  values (p_challenge_id, v_winner, v_winner is null, v_top_score);

  if v_winner is not null then
    insert into public.gamification_events
      (user_id, event_type, source_type, source_id, xp_delta, points_delta, leaderboard_delta, metadata)
    values
      (v_winner, 'challenge_win', 'challenge', p_challenge_id, c_win_xp, c_win_points, 0,
       jsonb_build_object('challenge_id', p_challenge_id, 'top_score', v_top_score))
    on conflict (user_id, event_type, source_type, source_id) where source_id is not null
    do nothing;

    update public.profiles
      set xp = xp + c_win_xp,
          points = points + c_win_points,
          challenges_won = challenges_won + 1,
          updated_at = now()
      where id = v_winner;

    select username, display_name into v_winner_username, v_winner_display
    from public.profiles where id = v_winner;
  end if;

  update public.challenges
    set finalized_at = now()
    where id = p_challenge_id;

  already_finalized := false;
  is_draw := (v_winner is null);
  winner_user_id := v_winner;
  winner_username := v_winner_username;
  winner_display_name := v_winner_display;
  top_score := v_top_score;
  return next;
end;
$$;

revoke all on function public.finalize_challenge(uuid) from public;
grant execute on function public.finalize_challenge(uuid) to authenticated;

comment on function public.finalize_challenge(uuid) is
  'Finalizes a COMPLETED challenge exactly once: derives the winner from the same leaderboard_delta ledger get_challenge_standings reads, freezes challenge_results, and awards the winner xp/points + challenges_won. Idempotent (row-locked + a repeat call returns the frozen result). A tie for first place is a draw: no winner, no award.';
