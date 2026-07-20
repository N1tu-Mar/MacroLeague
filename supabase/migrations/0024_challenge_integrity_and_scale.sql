-- Challenge integrity + listing scale.
--
-- Forward-only and ADDITIVE on top of 0001-0023. Fixes three defects found in
-- the pre-launch audit, all in the challenge subsystem.
--
-- ---------------------------------------------------------------------------
-- DEFECT 1 — Finalization only happened if a human opened the screen.
-- ---------------------------------------------------------------------------
--   0019 built finalize_challenge() correctly but nothing ever CALLED it on a
--   schedule: the client invoked it when a user opened a challenge detail screen.
--   A completed challenge therefore stayed unresolved — and the winner's
--   xp/points award never landed — until somebody happened to tap into it. A
--   challenge nobody reopens is never settled at all.
--
--   Fixed by finalize_due_challenges(), scheduled with pg_cron (same idiom as
--   0010). Results now freeze on their own, on time.
--
-- ---------------------------------------------------------------------------
-- DEFECT 2 — finalize_challenge() was callable by non-participants.
-- ---------------------------------------------------------------------------
--   0019 granted execute to every authenticated user and checked only that the
--   caller was signed in and that the challenge had ended. Any user could
--   finalize any ended challenge.
--
--   The blast radius was genuinely small — the outcome is fully derived from the
--   ledger, the award is hardcoded, the row is locked, and the ledger insert is
--   idempotent — so this was never a way to STEAL a win. But it let an outsider
--   control the TIMING of someone else's settlement, and there is no reason for
--   the surface to be open. Now restricted to participants and the creator.
--
--   The authorization check lives in finalize_challenge(); the derivation moves
--   unchanged into finalize_challenge_internal(), which cron calls directly.
--   Splitting it this way means there is still exactly ONE implementation of the
--   winner derivation — duplicating it for the cron path would be how the two
--   silently diverge later.
--
-- ---------------------------------------------------------------------------
-- DEFECT 3 — The challenge list read the ENTIRE participants table.
-- ---------------------------------------------------------------------------
--   challengeService.listChallenges() ran `select challenge_id, user_id from
--   challenge_participants` with NO filter and NO limit, then counted in JS.
--   Two consequences, the second much worse than the first:
--     1. The payload grew linearly with total app usage.
--     2. config.toml sets max_rows = 1000. Past 1000 participant rows PostgREST
--        SILENTLY truncates, so participantCount and joined would have started
--        returning WRONG values for users on the truncated tail, with no error
--        anywhere. A correctness bug on a timer, not merely a slow query.
--   Fixed by list_challenges_with_counts(), which aggregates in the database.

-- ===========================================================================
-- 1. finalize_challenge_internal — the derivation, verbatim from 0019.
--
-- No auth check: this is the trusted core, callable only by the two entry
-- points below (both of which do their own authorization). Revoked from every
-- client role.
-- ===========================================================================
create or replace function public.finalize_challenge_internal(p_challenge_id uuid)
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

  v_end             date;
  v_finalized       timestamptz;
  v_top_score       bigint;
  v_winner          uuid;
  v_winner_username text;
  v_winner_display  text;
begin
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

revoke all on function public.finalize_challenge_internal(uuid) from public;
revoke all on function public.finalize_challenge_internal(uuid) from anon, authenticated;

comment on function public.finalize_challenge_internal(uuid) is
  'Trusted core of challenge finalization. Performs NO authorization — callers '
  'must authorize first. Not reachable by any client role.';

-- ===========================================================================
-- 2. finalize_challenge — same signature and behavior as 0019, plus the
--    participant/creator authorization the audit found missing.
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
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  -- Only someone actually IN the challenge (or who created it) may settle it.
  -- The outcome is derived either way, so this does not change any result — it
  -- stops an outsider choosing WHEN someone else's challenge settles.
  if not exists (
    select 1 from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id and cp.user_id = v_user
  ) and not exists (
    select 1 from public.challenges c
    where c.id = p_challenge_id and c.created_by = v_user
  ) then
    raise exception 'Only a participant can finalize this challenge.';
  end if;

  return query select * from public.finalize_challenge_internal(p_challenge_id);
end;
$$;

revoke all on function public.finalize_challenge(uuid) from public;
revoke all on function public.finalize_challenge(uuid) from anon;
grant execute on function public.finalize_challenge(uuid) to authenticated;

comment on function public.finalize_challenge(uuid) is
  'Finalizes a COMPLETED challenge exactly once, for a participant or the '
  'creator. Derivation lives in finalize_challenge_internal(). Idempotent: a '
  'repeat call returns the frozen result. A tie for first place is a draw.';

-- ===========================================================================
-- 3. finalize_due_challenges — the scheduled settler.
--
-- Each challenge is finalized in its OWN exception block: one bad row (a race,
-- a constraint surprise) must not abort the whole nightly sweep and leave every
-- later challenge unsettled.
-- ===========================================================================
create or replace function public.finalize_due_challenges(p_max integer default 500)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row       record;
  v_finalized integer := 0;
begin
  for v_row in
    select c.id
    from public.challenges c
    where c.finalized_at is null
      and current_date > c.end_date
    order by c.end_date
    limit greatest(1, coalesce(p_max, 500))
  loop
    begin
      perform public.finalize_challenge_internal(v_row.id);
      v_finalized := v_finalized + 1;
    exception when others then
      raise warning 'finalize_due_challenges: challenge % failed: %', v_row.id, sqlerrm;
    end;
  end loop;

  return v_finalized;
end;
$$;

revoke all on function public.finalize_due_challenges(integer) from public;
revoke all on function public.finalize_due_challenges(integer) from anon, authenticated;
grant execute on function public.finalize_due_challenges(integer) to service_role;

comment on function public.finalize_due_challenges(integer) is
  'Finalizes every challenge whose window has closed. Scheduled daily; each '
  'challenge is isolated so one failure cannot stall the sweep.';

-- Runs daily at 05:00 UTC — after the 04:00 account purge and 04:30 quota
-- prune, so the three scheduled jobs do not overlap. cron.schedule upserts by
-- name, so re-running this migration is idempotent.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'finalize-due-challenges',
      '0 5 * * *',
      'select public.finalize_due_challenges();'
    );
  end if;
end;
$$;

-- ===========================================================================
-- 4. list_challenges_with_counts — aggregate in the DB, not in the client.
--
-- Replaces the unbounded `select challenge_id, user_id from
-- challenge_participants` that silently truncated at max_rows.
-- ===========================================================================
create or replace function public.list_challenges_with_counts()
returns table (
  id                uuid,
  created_by        uuid,
  name              text,
  type              text,
  goal_type         text,
  stakes_text       text,
  duration_days     integer,
  start_date        date,
  end_date          date,
  participant_count integer,
  joined            boolean,
  finalized_at      timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.created_by,
    c.name,
    c.type,
    c.goal_type,
    c.stakes_text,
    c.duration_days,
    c.start_date,
    c.end_date,
    coalesce(pc.total, 0)::integer,
    coalesce(pc.mine, false),
    c.finalized_at
  from public.challenges c
  left join lateral (
    select
      count(*)::integer as total,
      bool_or(cp.user_id = auth.uid()) as mine
    from public.challenge_participants cp
    where cp.challenge_id = c.id
  ) pc on true
  where auth.uid() is not null
  order by c.start_date desc;
$$;

revoke all on function public.list_challenges_with_counts() from public;
revoke all on function public.list_challenges_with_counts() from anon;
grant execute on function public.list_challenges_with_counts() to authenticated;

comment on function public.list_challenges_with_counts() is
  'Challenge list with server-side participant counts and a per-caller joined '
  'flag. Replaces a client-side aggregation that silently truncated at max_rows.';

-- Supports the per-challenge count above.
create index if not exists challenge_participants_challenge_idx
  on public.challenge_participants (challenge_id);

-- ===========================================================================
-- 5. Scope the read policies flagged in the audit to authenticated callers.
--
-- These policies were written without a `to` clause, which defaults to PUBLIC
-- and therefore INCLUDES the anon role. The anon key ships inside the app
-- binary, so anyone could read every challenge plus every challenge_participants
-- row (user_id + team_name) without signing in — a free enumeration of the user
-- graph. The comments in 0007 said "anyone signed in can discover them"; these
-- policies now implement that.
-- ===========================================================================
drop policy if exists "read challenges" on public.challenges;
create policy "read challenges"
  on public.challenges for select
  to authenticated
  using (true);

-- Note the name: 0007 created this as "read participants", not
-- "read challenge participants". Dropping the wrong name would silently leave
-- the permissive policy in place.
drop policy if exists "read participants" on public.challenge_participants;
create policy "read participants"
  on public.challenge_participants for select
  to authenticated
  using (true);

drop policy if exists "read challenge goals" on public.challenge_goals;
create policy "read challenge goals"
  on public.challenge_goals for select
  to authenticated
  using (true);

drop policy if exists "read challenge results" on public.challenge_results;
create policy "read challenge results"
  on public.challenge_results for select
  to authenticated
  using (true);

-- Same defect on the nutrition catalog: readable by anon because no `to` clause
-- was given. These hold no personal data, so the exposure is a public food
-- database rather than user information — but there is no reason to serve it to
-- signed-out callers either, and leaving them PUBLIC keeps a trap in place for
-- whoever adds a user-scoped column later.
drop policy if exists "read all foods" on public.foods;
create policy "read all foods"
  on public.foods for select
  to authenticated
  using (true);

drop policy if exists "read nutrition sources" on public.nutrition_sources;
create policy "read nutrition sources"
  on public.nutrition_sources for select
  to authenticated
  using (true);

drop policy if exists "read food portions" on public.food_portions;
create policy "read food portions"
  on public.food_portions for select
  to authenticated
  using (true);
