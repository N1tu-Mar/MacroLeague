-- Friendships (request/accept) + challenge invites by user.
--
-- Forward-only and ADDITIVE on top of 0001-0010. It introduces the app's social
-- layer: a consent-based friendship graph and the ability to invite a specific
-- person into a challenge.
--
-- WHY EVERYTHING IS AN RPC
--   profiles RLS is own-row only ("read own profile": id = auth.uid()), so a user
--   cannot SELECT anyone else's profile directly. Every cross-user read here
--   (search, friends list, friend requests, friends leaderboard, invite names)
--   therefore runs through SECURITY DEFINER functions that expose ONLY display
--   fields — exactly the pattern get_leaderboard / get_challenge_standings use.
--   All mutations are likewise routed through SECURITY DEFINER functions so the
--   request/accept state machine and self/duplicate checks are enforced
--   server-side; clients get SELECT-only RLS and no direct INSERT/UPDATE/DELETE.

-- ===========================================================================
-- 1. friendships — one row per unordered pair, regardless of who requested.
-- ===========================================================================
create table public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles(id) on delete cascade,
  addressee_id  uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> addressee_id)
);

-- Exactly one relationship per pair in EITHER direction (A->B and B->A collide).
create unique index friendships_pair_unique
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_requester on public.friendships (requester_id);
create index friendships_addressee on public.friendships (addressee_id);

alter table public.friendships enable row level security;

-- Either party may read the row; all writes go through the definer RPCs below.
create policy "read own friendships"
  on public.friendships for select
  to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- ===========================================================================
-- 2. challenge_invites — invite a specific user into a specific challenge.
-- ===========================================================================
create table public.challenge_invites (
  id            uuid primary key default gen_random_uuid(),
  challenge_id  uuid not null references public.challenges(id) on delete cascade,
  inviter_id    uuid not null references public.profiles(id) on delete cascade,
  invitee_id    uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint challenge_invites_no_self check (inviter_id <> invitee_id)
);

create unique index challenge_invites_unique
  on public.challenge_invites (challenge_id, invitee_id);
create index challenge_invites_invitee on public.challenge_invites (invitee_id);

alter table public.challenge_invites enable row level security;

create policy "read own challenge invites"
  on public.challenge_invites for select
  to authenticated
  using (inviter_id = auth.uid() or invitee_id = auth.uid());

-- ===========================================================================
-- 3. Friend search. Returns display fields + the caller-relative relationship so
--    the UI can render Add / Requested / Accept / Friends without another query.
-- ===========================================================================
create or replace function public.search_users(p_query text)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  university text,
  friendship_status text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    p.id, p.username, p.display_name, p.avatar_url, p.university,
    case
      when f.status = 'accepted'                                   then 'friends'
      when f.status = 'pending' and f.requester_id = auth.uid()    then 'outgoing'
      when f.status = 'pending' and f.addressee_id = auth.uid()    then 'incoming'
      else 'none'
    end as friendship_status
  from public.profiles p
  left join public.friendships f
    on least(f.requester_id, f.addressee_id)    = least(p.id, auth.uid())
   and greatest(f.requester_id, f.addressee_id) = greatest(p.id, auth.uid())
  where p.id <> auth.uid()
    and char_length(btrim(p_query)) >= 2
    and (p.username ilike '%' || btrim(p_query) || '%'
         or p.display_name ilike '%' || btrim(p_query) || '%')
  order by
    (lower(coalesce(p.display_name, p.username)) = lower(btrim(p_query))) desc,
    coalesce(p.display_name, p.username)
  limit 20;
$$;

-- ===========================================================================
-- 4. Friendship mutations. Each enforces auth + self/duplicate rules and returns
--    the new caller-relative status ('friends' | 'outgoing' | 'none').
-- ===========================================================================
create or replace function public.send_friend_request(p_addressee uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_row public.friendships%rowtype;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_addressee = v_me then raise exception 'You cannot add yourself.'; end if;
  perform 1 from public.profiles where id = p_addressee;
  if not found then raise exception 'User not found.'; end if;

  select * into v_row from public.friendships
   where least(requester_id, addressee_id)    = least(v_me, p_addressee)
     and greatest(requester_id, addressee_id) = greatest(v_me, p_addressee);

  if found then
    if v_row.status = 'accepted' then
      return 'friends';
    elsif v_row.requester_id = v_me then
      return 'outgoing';                         -- already waiting on them
    else
      update public.friendships set status = 'accepted', updated_at = now() where id = v_row.id;
      return 'friends';                          -- they'd already requested me: reciprocate
    end if;
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (v_me, p_addressee, 'pending');
  return 'outgoing';
end;
$$;

create or replace function public.respond_friend_request(p_requester uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  select id into v_id from public.friendships
   where requester_id = p_requester and addressee_id = v_me and status = 'pending';
  if v_id is null then raise exception 'No pending request from this user.'; end if;

  if p_accept then
    update public.friendships set status = 'accepted', updated_at = now() where id = v_id;
    return 'friends';
  else
    delete from public.friendships where id = v_id;
    return 'none';
  end if;
end;
$$;

create or replace function public.remove_friend(p_other uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  delete from public.friendships
   where least(requester_id, addressee_id)    = least(v_me, p_other)
     and greatest(requester_id, addressee_id) = greatest(v_me, p_other);
end;
$$;

-- ===========================================================================
-- 5. Friend reads: accepted friends, incoming requests, and a friends-only
--    leaderboard. The friends board INCLUDES the caller and shows zero scores
--    (unlike the global board's having>0) so a fresh friend circle still renders.
-- ===========================================================================
create or replace function public.get_friends()
returns table (
  user_id uuid, username text, display_name text, avatar_url text, university text, streak_count integer
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.university, p.streak_count
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.status = 'accepted'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  order by coalesce(p.display_name, p.username);
$$;

create or replace function public.get_friend_requests()
returns table (
  user_id uuid, username text, display_name text, avatar_url text, university text, requested_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.university, f.created_at
  from public.friendships f
  join public.profiles p on p.id = f.requester_id
  where f.addressee_id = auth.uid() and f.status = 'pending'
  order by f.created_at desc;
$$;

create or replace function public.get_friends_leaderboard(p_window_days integer default 14)
returns table (
  user_id uuid, username text, display_name text, university text, avatar_url text, score bigint, streak_count integer
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with circle as (
    select auth.uid() as id
    union
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted' and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  )
  select
    p.id, p.username, p.display_name, p.university, p.avatar_url,
    coalesce(sum(e.leaderboard_delta) filter (
      where e.leaderboard_delta <> 0
        and e.occurred_at >= now() - make_interval(days => least(greatest(p_window_days, 1), 60))
    ), 0)::bigint as score,
    p.streak_count
  from circle c
  join public.profiles p on p.id = c.id
  left join public.gamification_events e on e.user_id = p.id
  group by p.id, p.username, p.display_name, p.university, p.avatar_url, p.streak_count
  order by score desc, p.streak_count desc;
$$;

-- ===========================================================================
-- 6. Challenge invites: invite a participant-of-mine target, respond (accept
--    auto-joins), and list my incoming invites.
-- ===========================================================================
create or replace function public.invite_to_challenge(p_challenge_id uuid, p_invitee uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_invitee = v_me then raise exception 'You cannot invite yourself.'; end if;

  perform 1 from public.challenge_participants where challenge_id = p_challenge_id and user_id = v_me;
  if not found then raise exception 'Only a participant can invite others to this challenge.'; end if;

  perform 1 from public.profiles where id = p_invitee;
  if not found then raise exception 'User not found.'; end if;

  perform 1 from public.challenge_participants where challenge_id = p_challenge_id and user_id = p_invitee;
  if found then raise exception 'That user is already in this challenge.'; end if;

  insert into public.challenge_invites (challenge_id, inviter_id, invitee_id, status)
  values (p_challenge_id, v_me, p_invitee, 'pending')
  on conflict (challenge_id, invitee_id) do update
    set status     = 'pending',          -- re-inviting after a decline reopens it
        inviter_id = excluded.inviter_id,
        updated_at = now()
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
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  select challenge_id into v_challenge from public.challenge_invites
   where id = p_invite_id and invitee_id = v_me and status = 'pending';
  if v_challenge is null then raise exception 'No pending invite.'; end if;

  if p_accept then
    update public.challenge_invites set status = 'accepted', updated_at = now() where id = p_invite_id;
    insert into public.challenge_participants (challenge_id, user_id, team_name)
    values (v_challenge, v_me, 'My Team')
    on conflict (challenge_id, user_id) do nothing;
  else
    update public.challenge_invites set status = 'declined', updated_at = now() where id = p_invite_id;
  end if;
end;
$$;

create or replace function public.get_challenge_invites()
returns table (
  invite_id uuid, challenge_id uuid, challenge_name text, goal_type text,
  end_date date, inviter_id uuid, inviter_name text, created_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select ci.id, c.id, c.name, c.goal_type, c.end_date, p.id,
         coalesce(nullif(btrim(p.display_name), ''), p.username), ci.created_at
  from public.challenge_invites ci
  join public.challenges c on c.id = ci.challenge_id
  join public.profiles p   on p.id = ci.inviter_id
  where ci.invitee_id = auth.uid() and ci.status = 'pending'
  order by ci.created_at desc;
$$;

-- ===========================================================================
-- 7. Privileges: definer functions are callable only by signed-in users.
-- ===========================================================================
revoke all on function public.search_users(text)                       from public;
revoke all on function public.send_friend_request(uuid)                from public;
revoke all on function public.respond_friend_request(uuid, boolean)    from public;
revoke all on function public.remove_friend(uuid)                      from public;
revoke all on function public.get_friends()                            from public;
revoke all on function public.get_friend_requests()                    from public;
revoke all on function public.get_friends_leaderboard(integer)         from public;
revoke all on function public.invite_to_challenge(uuid, uuid)          from public;
revoke all on function public.respond_challenge_invite(uuid, boolean)  from public;
revoke all on function public.get_challenge_invites()                  from public;

grant execute on function public.search_users(text)                      to authenticated;
grant execute on function public.send_friend_request(uuid)               to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean)   to authenticated;
grant execute on function public.remove_friend(uuid)                     to authenticated;
grant execute on function public.get_friends()                           to authenticated;
grant execute on function public.get_friend_requests()                   to authenticated;
grant execute on function public.get_friends_leaderboard(integer)        to authenticated;
grant execute on function public.invite_to_challenge(uuid, uuid)         to authenticated;
grant execute on function public.respond_challenge_invite(uuid, boolean) to authenticated;
grant execute on function public.get_challenge_invites()                 to authenticated;
