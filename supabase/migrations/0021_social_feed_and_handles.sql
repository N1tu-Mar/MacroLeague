-- Real friend activity feed + linked social handles.
--
-- Forward-only and ADDITIVE on top of 0001-0020.
--
-- WHAT THIS FIXES:
--   HomeScreen rendered a section titled "Friend activity" fed by
--   getRecentActivityFeed(), which reads the SIGNED-IN USER'S OWN
--   gamification_events (RLS restricts to own rows) and stamped the viewer's own
--   name on every row. There was no cross-user feed anywhere in the app. This
--   migration builds the real one.
--
-- TRUST MODEL (mirrors 0011's friends design — RPC-only cross-user access):
--   * gamification_events keeps its own-rows-only RLS. NOTHING here loosens it.
--     Friend visibility is granted exclusively through get_friend_activity_feed(),
--     a SECURITY DEFINER function that re-derives the caller's friend set from
--     `friendships` on every call. There is no policy a client can lean on to
--     read another user's ledger directly.
--   * The feed exposes a DELIBERATELY NARROW projection: event type, the points
--     delta, when it happened, and the actor's public display fields. It never
--     returns meal contents, macros, goals, free_text, or any row from
--     meal_logs / user_daily_activity. Someone's food diary is not social data.
--   * Per-user opt-out: profiles.activity_visibility = 'private' removes that
--     user from every friend's feed immediately, without unfriending anyone.
--   * Social handles are NOT public. get_friend_social_links() returns them only
--     to accepted friends, and only when the owner set them to be shared.
--
-- WHY HANDLES ARE STORED AS HANDLES, NOT URLS:
--   Storing "https://instagram.com/<user>" would let a user point every viewer's
--   browser at an arbitrary host. We store a bare, format-checked handle and the
--   CLIENT builds the URL from a fixed per-platform template, so a handle can
--   never become an open redirect. This is the same reasoning 0014 used to
--   scheme-restrict avatar_url.

-- ===========================================================================
-- 1. profiles — activity visibility + linked social handles.
-- ===========================================================================
alter table public.profiles
  add column if not exists activity_visibility text not null default 'friends',
  add column if not exists instagram_handle text,
  add column if not exists snapchat_handle text,
  add column if not exists tiktok_handle text,
  add column if not exists social_links_visibility text not null default 'friends';

-- Drop-then-add so re-running the migration is safe (constraints have no
-- IF NOT EXISTS form).
alter table public.profiles
  drop constraint if exists profiles_activity_visibility_check,
  drop constraint if exists profiles_social_links_visibility_check,
  drop constraint if exists profiles_instagram_handle_format,
  drop constraint if exists profiles_snapchat_handle_format,
  drop constraint if exists profiles_tiktok_handle_format;

alter table public.profiles
  add constraint profiles_activity_visibility_check
    check (activity_visibility in ('friends', 'private')),
  add constraint profiles_social_links_visibility_check
    check (social_links_visibility in ('friends', 'private')),
  -- Platform-accurate character classes. Anchored, length-bounded, and with NO
  -- scheme/host component, so the stored value cannot carry a URL.
  add constraint profiles_instagram_handle_format
    check (instagram_handle is null
           or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$'),
  add constraint profiles_snapchat_handle_format
    check (snapchat_handle is null
           or snapchat_handle ~ '^[A-Za-z0-9._-]{3,15}$'),
  add constraint profiles_tiktok_handle_format
    check (tiktok_handle is null
           or tiktok_handle ~ '^[A-Za-z0-9._]{2,24}$');

comment on column public.profiles.activity_visibility is
  'friends = this user''s events appear in their friends'' feeds; private = they appear nowhere. Never exposes events to non-friends in either case.';
comment on column public.profiles.instagram_handle is
  'Bare handle only, never a URL. Clients build the link from a fixed template so a handle cannot become an open redirect.';

-- Extend the column-level UPDATE grant established in 0006 and widened in 0012.
-- The client may set its OWN display + social fields and nothing else; xp,
-- points, streak_count and friends remain unwritable from the client.
grant update (
  display_name,
  university,
  goal_type,
  avatar_url,
  preferred_dining_hall,
  activity_visibility,
  social_links_visibility,
  instagram_handle,
  snapchat_handle,
  tiktok_handle
) on public.profiles to authenticated;

-- ===========================================================================
-- 2. activity_reactions — lightweight social response to a feed event.
--
-- A feed nobody can respond to is a changelog. This is the minimum interaction
-- that makes it social, and it doubles as the notification trigger in 0023.
-- ===========================================================================
create table if not exists public.activity_reactions (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.gamification_events (id) on delete cascade,
  -- Denormalized owner of the reacted-to event. Lets the feed aggregate and the
  -- notification fan-out avoid re-joining gamification_events, which is the
  -- hottest table in the app.
  event_owner_id uuid not null references public.profiles (id) on delete cascade,
  reactor_id uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  created_at timestamptz not null default now(),
  constraint activity_reactions_kind_check
    check (kind in ('fire', 'muscle', 'clap', 'trophy')),
  constraint activity_reactions_no_self check (event_owner_id <> reactor_id)
);

-- One reaction per (event, reactor) — changing your mind updates the row rather
-- than stacking. This is what makes react/unreact idempotent.
create unique index if not exists activity_reactions_unique
  on public.activity_reactions (event_id, reactor_id);
create index if not exists activity_reactions_event
  on public.activity_reactions (event_id);
create index if not exists activity_reactions_owner_created
  on public.activity_reactions (event_owner_id, created_at desc);

alter table public.activity_reactions enable row level security;

-- Clients read only their OWN reactions (so the UI can render "you reacted").
-- Everyone else's reactions reach the client ONLY as aggregate counts from the
-- feed RPC, so reacting cannot be used to enumerate who is friends with whom.
create policy "read own reactions"
  on public.activity_reactions for select
  to authenticated
  using (reactor_id = auth.uid());

-- No client INSERT/UPDATE/DELETE policy: all writes go through react_to_activity()
-- below, which verifies friendship before allowing the write.

comment on table public.activity_reactions is
  'Reactions to friends'' gamification events. Client reads are own-rows-only; '
  'cross-user visibility is aggregate-only via get_friend_activity_feed().';

-- ===========================================================================
-- 3. get_friend_activity_feed — THE feed.
--
-- Keyset pagination on (occurred_at, id): p_before is the last row the client
-- already has. Keyset rather than OFFSET because the feed is append-heavy at the
-- head, where OFFSET both drifts and degrades linearly.
-- ===========================================================================
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
  -- The caller's accepted friends, in both directions.
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
      -- Deactivated accounts (0009) drop out of the feed immediately.
      and p.deactivated_at is null
      -- Redemptions are a private financial action, not a social event.
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
    -- Never leak the generated user_<hex> placeholder as a public name; the
    -- client's publicLeaderboardName() applies the same rule.
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
    v.metadata,
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
revoke all on function public.get_friend_activity_feed(integer, timestamptz, uuid) from anon;
grant execute on function public.get_friend_activity_feed(integer, timestamptz, uuid) to authenticated;

comment on function public.get_friend_activity_feed(integer, timestamptz, uuid) is
  'Accepted friends'' recent gamification events, newest first, keyset-paginated. '
  'Honors activity_visibility and excludes reward redemptions. The ONLY path by '
  'which one user sees another''s ledger.';

-- ===========================================================================
-- 4. react_to_activity — toggle a reaction on a friend's event.
--
-- Returns the resulting state so the client can update without a refetch.
-- ===========================================================================
create or replace function public.react_to_activity(
  p_event_id uuid,
  p_kind     text default 'fire'
)
returns table (r_reaction_count integer, r_viewer_reaction text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me      uuid := auth.uid();
  v_owner   uuid;
  v_existing text;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_kind is null or p_kind not in ('fire', 'muscle', 'clap', 'trophy') then
    raise exception 'Unknown reaction.';
  end if;

  select e.user_id into v_owner
  from public.gamification_events e
  where e.id = p_event_id;

  if v_owner is null then raise exception 'Activity not found.'; end if;
  if v_owner = v_me then raise exception 'You cannot react to your own activity.'; end if;

  -- Authorization: you may only react to an ACCEPTED friend's event, and only
  -- while they are sharing activity. Re-derived here rather than trusted from
  -- the client, so a guessed event id is useless.
  perform 1
  from public.friendships f
  join public.profiles p on p.id = v_owner
  where f.status = 'accepted'
    and least(f.requester_id, f.addressee_id)    = least(v_me, v_owner)
    and greatest(f.requester_id, f.addressee_id) = greatest(v_me, v_owner)
    and p.activity_visibility = 'friends';
  if not found then raise exception 'You can only react to a friend''s activity.'; end if;

  select ar.kind into v_existing
  from public.activity_reactions ar
  where ar.event_id = p_event_id and ar.reactor_id = v_me;

  if v_existing is null then
    insert into public.activity_reactions (event_id, event_owner_id, reactor_id, kind)
    values (p_event_id, v_owner, v_me, p_kind);
  elsif v_existing = p_kind then
    -- Same reaction again = remove it (toggle).
    delete from public.activity_reactions
    where event_id = p_event_id and reactor_id = v_me;
  else
    -- Different reaction = switch it.
    update public.activity_reactions
    set kind = p_kind, created_at = now()
    where event_id = p_event_id and reactor_id = v_me;
  end if;

  return query
  select
    (select count(*)::integer from public.activity_reactions where event_id = p_event_id),
    (select ar2.kind from public.activity_reactions ar2
      where ar2.event_id = p_event_id and ar2.reactor_id = v_me);
end;
$$;

revoke all on function public.react_to_activity(uuid, text) from public;
revoke all on function public.react_to_activity(uuid, text) from anon;
grant execute on function public.react_to_activity(uuid, text) to authenticated;

-- ===========================================================================
-- 5. get_friend_social_links — a friend's linked handles, if they share them.
--
-- Returns AT MOST one row. Non-friends, private settings, and unknown ids are
-- all indistinguishable (zero rows), so this cannot be used to probe whether an
-- account exists or whether someone has a given platform linked.
-- ===========================================================================
create or replace function public.get_friend_social_links(p_user_id uuid)
returns table (
  instagram_handle text,
  snapchat_handle  text,
  tiktok_handle    text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.instagram_handle, p.snapchat_handle, p.tiktok_handle
  from public.profiles p
  where p.id = p_user_id
    and auth.uid() is not null
    and p.social_links_visibility = 'friends'
    and p.deactivated_at is null
    and (
      p.id = auth.uid()
      or exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and least(f.requester_id, f.addressee_id)    = least(auth.uid(), p_user_id)
          and greatest(f.requester_id, f.addressee_id) = greatest(auth.uid(), p_user_id)
      )
    );
$$;

revoke all on function public.get_friend_social_links(uuid) from public;
revoke all on function public.get_friend_social_links(uuid) from anon;
grant execute on function public.get_friend_social_links(uuid) to authenticated;

comment on function public.get_friend_social_links(uuid) is
  'A user''s social handles, visible only to accepted friends and only when they '
  'opted in. Returns zero rows for every denied case so it cannot be used to '
  'enumerate accounts.';

-- ===========================================================================
-- 6. Search performance (flagged in the pre-launch audit).
--
-- search_users() (0011) does a LEADING-wildcard ILIKE on username and
-- display_name. A leading '%' cannot use the b-tree on username, and
-- display_name had no index at all, so every keystroke was a full seq scan of
-- profiles. Trigram GIN indexes are the correct structure for '%foo%'.
-- ===========================================================================
create extension if not exists pg_trgm;

create index if not exists profiles_username_trgm
  on public.profiles using gin (username gin_trgm_ops);
create index if not exists profiles_display_name_trgm
  on public.profiles using gin (display_name gin_trgm_ops);

-- Also flagged: challenge_results.winner_user_id and foods.created_by were
-- unindexed despite being used by lookups and by the 0001 "own foods" policies.
create index if not exists challenge_results_winner_idx
  on public.challenge_results (winner_user_id)
  where winner_user_id is not null;
create index if not exists foods_created_by_idx
  on public.foods (created_by)
  where created_by is not null;
