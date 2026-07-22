-- ===========================================================================
-- 0028 — Close the integrity/privacy gaps found in the 2026-07-22 deep-dive
--        re-audit (two parallel agents), all verified against the net final
--        schema (0001–0027) and against how the client actually uses each path.
--
--   1. Forfeit-penalty bypass (HIGH). "leave as self" (0007) lets a losing
--      participant DELETE their challenge_participants row directly, skipping
--      leave_challenge()'s -20 forfeit; "delete own challenges" lets a creator
--      cascade-delete an in-progress challenge to vacate it penalty-free.
--   2. Retroactive challenge scoring via late join (MEDIUM). get_challenge_
--      standings + finalize_challenge_internal sum leaderboard_delta from
--      start_date with NO joined_at lower bound, so a heavy user joins the day
--      before end_date and is credited with the whole window -> steals the win.
--   3. Deactivated accounts keep spend/earn access in the 14-day grace window
--      (MEDIUM). No write RPC checked deactivated_at; a "deleted" (possibly
--      compromised) account could still drain the reward catalog and farm.
--   4. Friend-feed macro leak (MEDIUM). get_friend_activity_feed returned event
--      metadata verbatim, exposing daily calorie/protein/carb totals + protein
--      goal that 0021's design says it never reveals.
--   5. Ended-challenge invite/accept + invite spam (LOW-MEDIUM). invite/respond
--      (0011) didn't check the challenge was still running, required no
--      friendship (client only ever invites friends), and re-opened declined
--      invites (harassment).
--   6. Foods-cache poisoning (LOW / latent). "insert own foods" (0001) let a
--      client claim a provider (source_id, external_id) cache slot. Not served
--      today (macros are re-fetched) but a latent cross-user trap; close it.
--   7. Avatar tracking-pixel (MEDIUM-LOW). avatar_url (0014) allowed any https
--      host; every profile/leaderboard viewer's client fetches it (IP harvest).
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Forfeit-penalty bypass.
--    leave_challenge() is SECURITY DEFINER (runs as owner), so it still deletes
--    the row after we remove the client's direct DELETE path. The client only
--    ever leaves via that RPC (verified in challengeService.ts) and never
--    deletes challenges, so both changes are transparent to the app.
-- ---------------------------------------------------------------------------
drop policy if exists "leave as self" on public.challenge_participants;
revoke delete on public.challenge_participants from authenticated;

drop policy if exists "delete own challenges" on public.challenges;
create policy "delete own challenges"
  on public.challenges
  for delete
  to authenticated
  using (
    created_by = auth.uid()
    and finalized_at is null
    and (select count(*) from public.challenge_participants cp
         where cp.challenge_id = id) <= 1
  );

-- ---------------------------------------------------------------------------
-- 2. Retroactive scoring — lower-bound the ledger scan by join time in BOTH
--    scoring paths. A participant is only credited for activity from the later
--    of the challenge start and when they actually joined.
-- ---------------------------------------------------------------------------
create or replace function public.get_challenge_standings(p_challenge_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  team_name text,
  streak_count integer,
  score bigint
)
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    cp.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    cp.team_name,
    p.streak_count,
    coalesce((
      select sum(e.leaderboard_delta)
      from public.gamification_events e
      where e.user_id = cp.user_id
        and e.leaderboard_delta <> 0
        and e.occurred_at >= greatest(c.start_date::timestamptz, cp.joined_at)
        and e.occurred_at <  (c.end_date + 1)::timestamptz
    ), 0)::bigint as score
  from public.challenge_participants cp
  join public.challenges c on c.id = cp.challenge_id
  join public.profiles    p on p.id = cp.user_id
  where cp.challenge_id = p_challenge_id
    and p.deactivated_at is null
    and auth.uid() is not null
  order by score desc, p.streak_count desc;
$$;

revoke all on function public.get_challenge_standings(uuid) from public;
revoke all on function public.get_challenge_standings(uuid) from anon, authenticated;
grant execute on function public.get_challenge_standings(uuid) to authenticated;

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
  c_win_points constant integer := 100;
  c_win_xp     constant integer := 100;

  v_end             date;
  v_finalized       timestamptz;
  v_top_score       bigint;
  v_winner          uuid;
  v_winner_username text;
  v_winner_display  text;
begin
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

  with standings as (
    select
      cp.user_id,
      coalesce((
        select sum(e.leaderboard_delta)
        from public.gamification_events e
        where e.user_id = cp.user_id
          and e.leaderboard_delta <> 0
          and e.occurred_at >= greatest(c.start_date::timestamptz, cp.joined_at)
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

-- ---------------------------------------------------------------------------
-- 3. Freeze soft-deleted accounts during the grace window.
--    (a) Spending: redeem_reward refuses if the caller is deactivated — the
--        highest-value action (drains catalog / issues real bearer passes).
--    (b) Earning: extend 0027's meal-insert guard to reject deactivated users,
--        so a frozen account cannot farm points/streak either.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_reward(p_reward_id uuid)
returns table (
  new_balance      integer,
  user_reward_id   uuid,
  code             text,
  expires_at       timestamptz,
  status           text,
  already_redeemed boolean
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_cost    integer;
  v_active  boolean;
  v_expiry  date;
  v_balance integer;
  v_ur_id   uuid;
  v_deact   timestamptz;
  v_pass    public.reward_redemptions;
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

  select points, deactivated_at into v_balance, v_deact
  from public.profiles where id = v_user for update;
  if v_balance is null then
    raise exception 'Your account profile is missing';
  end if;
  -- A deactivated (scheduled-for-deletion) account is frozen: no spending.
  if v_deact is not null then
    raise exception 'Your account is deactivated';
  end if;

  select ur.id into v_ur_id
  from public.user_rewards ur
  where ur.user_id = v_user and ur.reward_id = p_reward_id;

  if v_ur_id is not null then
    select * into v_pass
    from public.reward_redemptions r
    where r.user_id = v_user and r.reward_id = p_reward_id
    order by r.issued_at desc
    limit 1;

    if v_pass.id is null then
      select ur.points_spent into v_cost from public.user_rewards ur where ur.id = v_ur_id;
      v_pass := public.issue_reward_code(v_user, p_reward_id, coalesce(v_cost, 0));
    end if;

    return query
      select v_balance, v_ur_id, v_pass.code, v_pass.expires_at, v_pass.status, true;
    return;
  end if;

  if not v_active then
    raise exception 'This reward is no longer available';
  end if;
  if v_expiry is not null and v_expiry < current_date then
    raise exception 'This reward has expired';
  end if;
  if v_balance < v_cost then
    raise exception 'Not enough points to redeem this reward';
  end if;

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

  v_pass := public.issue_reward_code(v_user, p_reward_id, v_cost);

  select points into v_balance from public.profiles where id = v_user;
  return query
    select v_balance, v_ur_id, v_pass.code, v_pass.expires_at, v_pass.status, false;
end;
$$;

revoke all on function public.redeem_reward(uuid) from public;
grant execute on function public.redeem_reward(uuid) to authenticated;

-- (b) Earning path — extend the 0027 meal-log guard with a deactivated check.
create or replace function public.guard_meal_log_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  c_daily_cap constant integer := 40;
  v_recent    integer;
  v_deact     timestamptz;
begin
  -- A frozen (deactivated) account cannot earn.
  select deactivated_at into v_deact from public.profiles where id = new.user_id;
  if v_deact is not null then
    raise exception 'account is deactivated'
      using errcode = 'check_violation';
  end if;

  if new.eaten_at > now() + interval '1 day' then
    raise exception 'eaten_at cannot be in the future'
      using errcode = 'check_violation';
  end if;
  if new.eaten_at < now() - interval '2 days' then
    raise exception 'eaten_at is too far in the past to log'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_recent
  from public.meal_logs
  where user_id = new.user_id
    and eaten_at > now() - interval '1 day';

  if v_recent >= c_daily_cap then
    raise exception 'daily meal log limit reached'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_meal_log_insert() from public;
revoke all on function public.guard_meal_log_insert() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Friend-feed macro leak — re-create get_friend_activity_feed identically
--    except the returned metadata is WHITELISTED to display-safe keys (the feed
--    UI only ever reads `streak`). Diary numbers (calories/carbs_g/fat_g/
--    protein_g/goal_protein_g) never leave the DB. Whitelist, not blacklist, so
--    any future metadata key defaults to hidden.
-- ---------------------------------------------------------------------------
create or replace function public.get_friend_activity_feed(
  p_limit     integer default 20,
  p_before    timestamptz default null,
  p_before_id uuid default null
)
returns table (
  event_id      uuid,
  actor_id      uuid,
  actor_name    text,
  actor_username text,
  actor_avatar  text,
  event_type    text,
  points_delta  integer,
  xp_delta      integer,
  occurred_at   timestamptz,
  metadata      jsonb,
  reaction_count integer,
  viewer_reaction text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select auth.uid() as id
  ),
  friends as (
    select case when f.requester_id = (select id from me)
                then f.addressee_id else f.requester_id end as friend_id
    from public.friendships f
    where f.status = 'accepted'
      and (select id from me) is not null
      and ((select id from me) in (f.requester_id, f.addressee_id))
  ),
  visible as (
    select e.id, e.user_id, e.event_type, e.points_delta, e.xp_delta,
           e.occurred_at, e.metadata
    from public.gamification_events e
    join friends fr on fr.friend_id = e.user_id
    join public.profiles p on p.id = e.user_id
    where p.activity_visibility = 'friends'
      and p.deactivated_at is null
      and e.event_type <> 'reward_redemption'
      and (
        p_before is null
        or e.occurred_at < p_before
        or (e.occurred_at = p_before and p_before_id is not null and e.id < p_before_id)
      )
    order by e.occurred_at desc, e.id desc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  )
  select
    v.id,
    v.user_id,
    case
      when p.display_name is not null and p.display_name !~ '^user_'
        then p.display_name
      when p.username !~ '^user_' then p.username
      else 'MacroLeague athlete'
    end,
    p.username,
    p.avatar_url,
    v.event_type,
    v.points_delta,
    v.xp_delta,
    v.occurred_at,
    (
      select coalesce(jsonb_object_agg(k, v.metadata -> k), '{}'::jsonb)
      from unnest(array['streak','meal_count','activity_date',
                        'meal_source','top_score','challenge_id','penalty']) as k
      where v.metadata ? k
    ),
    coalesce(r.total, 0)::integer,
    mine.kind
  from visible v
  join public.profiles p on p.id = v.user_id
  left join lateral (
    select count(*)::integer as total
    from public.activity_reactions ar
    where ar.event_id = v.id
  ) r on true
  left join public.activity_reactions mine
    on mine.event_id = v.id and mine.reactor_id = auth.uid()
  order by v.occurred_at desc, v.id desc;
$$;

revoke all on function public.get_friend_activity_feed(integer, timestamptz, uuid) from public;
revoke all on function public.get_friend_activity_feed(integer, timestamptz, uuid) from anon, authenticated;
grant execute on function public.get_friend_activity_feed(integer, timestamptz, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Invite hardening — friends-only (the app only ever invites friends),
--    no inviting/accepting into an ended or finalized challenge, and never
--    re-open a declined invite (anti-harassment).
-- ---------------------------------------------------------------------------
create or replace function public.invite_to_challenge(p_challenge_id uuid, p_invitee uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_end date;
  v_final timestamptz;
  v_status text;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_invitee = v_me then raise exception 'You cannot invite yourself.'; end if;

  perform 1 from public.challenge_participants
   where challenge_id = p_challenge_id and user_id = v_me;
  if not found then raise exception 'Only a participant can invite others to this challenge.'; end if;

  -- Friends only.
  perform 1 from public.friendships f
   where f.status = 'accepted'
     and least(f.requester_id, f.addressee_id)    = least(v_me, p_invitee)
     and greatest(f.requester_id, f.addressee_id) = greatest(v_me, p_invitee);
  if not found then raise exception 'You can only invite a friend.'; end if;

  -- The challenge must still be running.
  select end_date, finalized_at into v_end, v_final
  from public.challenges where id = p_challenge_id;
  if v_end is null then raise exception 'Challenge not found.'; end if;
  if v_final is not null or current_date > v_end then
    raise exception 'This challenge has ended.';
  end if;

  perform 1 from public.challenge_participants
   where challenge_id = p_challenge_id and user_id = p_invitee;
  if found then raise exception 'That user is already in this challenge.'; end if;

  -- Never re-open a previously declined invite.
  select status into v_status from public.challenge_invites
   where challenge_id = p_challenge_id and invitee_id = p_invitee;
  if v_status = 'declined' then
    raise exception 'This user declined a previous invite to this challenge.';
  end if;

  insert into public.challenge_invites (challenge_id, inviter_id, invitee_id, status)
  values (p_challenge_id, v_me, p_invitee, 'pending')
  on conflict (challenge_id, invitee_id) do update
    set status     = 'pending',
        inviter_id = excluded.inviter_id,
        updated_at = now()
    where public.challenge_invites.status <> 'declined'
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.respond_challenge_invite(p_invite_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_challenge uuid;
  v_end date;
  v_final timestamptz;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  select challenge_id into v_challenge from public.challenge_invites
   where id = p_invite_id and invitee_id = v_me and status = 'pending';
  if v_challenge is null then raise exception 'No pending invite.'; end if;

  if p_accept then
    select end_date, finalized_at into v_end, v_final
    from public.challenges where id = v_challenge;
    if v_end is null then raise exception 'Challenge not found.'; end if;
    if v_final is not null or current_date > v_end then
      update public.challenge_invites set status = 'declined', updated_at = now() where id = p_invite_id;
      raise exception 'This challenge has ended.';
    end if;

    update public.challenge_invites set status = 'accepted', updated_at = now() where id = p_invite_id;
    insert into public.challenge_participants (challenge_id, user_id, team_name)
    values (v_challenge, v_me, 'My Team')
    on conflict (challenge_id, user_id) do nothing;
  else
    update public.challenge_invites set status = 'declined', updated_at = now() where id = p_invite_id;
  end if;
end;
$$;

revoke all on function public.invite_to_challenge(uuid, uuid) from public;
revoke all on function public.invite_to_challenge(uuid, uuid) from anon;
grant execute on function public.invite_to_challenge(uuid, uuid) to authenticated;
revoke all on function public.respond_challenge_invite(uuid, boolean) from public;
revoke all on function public.respond_challenge_invite(uuid, boolean) from anon;
grant execute on function public.respond_challenge_invite(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Foods-cache poisoning — clients may only write MANUAL foods (no provider
--    identity). Provider cache rows are written by the estimate-meal edge
--    function as service_role (bypasses RLS), so this is transparent to it.
-- ---------------------------------------------------------------------------
drop policy if exists "insert own foods" on public.foods;
create policy "insert own foods"
  on public.foods
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and source_id is null
    and external_id is null
  );

drop policy if exists "update own foods" on public.foods;
create policy "update own foods"
  on public.foods
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and source_id is null
    and external_id is null
  );

-- ---------------------------------------------------------------------------
-- 7. Avatar tracking-pixel — pin avatar_url to the DiceBear host used by the
--    default-avatar migration (0017) and the in-app picker. Every legitimate
--    avatar already matches, so nothing breaks.
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_avatar_url_ok;
alter table public.profiles
  add constraint profiles_avatar_url_ok
  check (
    avatar_url is null
    or (char_length(avatar_url) <= 500 and avatar_url ~* '^https://api\.dicebear\.com/')
  );

commit;
