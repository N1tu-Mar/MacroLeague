-- Real, server-issued reward redemption passes.
--
-- Forward-only and ADDITIVE on top of 0001-0021. It never edits earlier
-- migrations. It closes a hole that was worse than a missing feature, because
-- the missing piece sat behind a REAL spend: redeem_reward() (0006) has always
-- been correct — it appends the negative ledger event, decrements the cached
-- balance under a row lock, and records user_rewards atomically — but it issued
-- NOTHING the member could actually present. The client invented the pass:
-- RewardsScreen had a local passCode() that hashed the reward's id into a
-- string, so every member who redeemed the same reward saw the SAME code, and
-- the "QR" beside it was a static decorative glyph, not an encoding of
-- anything. Members were spending genuinely earned points on a pass no partner
-- could honour and no two members could be told apart by.
--
-- TRUST MODEL (mirrors redeem_reward in 0006 and finalize_challenge in 0019):
--   * Codes are SERVER-GENERATED, never client-supplied and never derived from
--     any value the client knows. They come from gen_random_bytes (pgcrypto's
--     CSPRNG), not from random()/md5(reward_id)/a sequence — a code must not be
--     predictable from another member's code, from the reward id, or from the
--     time of issue, because possession of the code IS the bearer credential a
--     partner honours.
--   * reward_redemptions has a select policy for the OWNER only and NO client
--     insert/update/delete policy at all. Every write goes through a
--     SECURITY DEFINER RPC. A member therefore cannot mint a pass, cannot
--     extend their own expiry, cannot flip a spent pass back to 'issued', and
--     cannot read anyone else's code (reading someone else's code would be
--     equivalent to stealing the reward, since the code is a bearer token).
--   * Issuance is WELDED to the spend. issue_reward_code() is a private helper
--     called from inside redeem_reward()'s existing transaction — the points
--     deduction is NOT duplicated or reimplemented here. Either the ledger
--     event, the balance decrement, the user_rewards row AND the code all
--     commit, or none of them do. There is no path that spends points without
--     issuing a code, and none that issues a code without a recorded spend.
--
-- WHY validate_reward_code IS service_role ONLY:
--   Validation is the destructive half: it burns a pass permanently. The honest
--   answer is that this app has NO staff/merchant role yet — there is no
--   `merchants` table, no partner auth, and no claim on the JWT that could
--   distinguish a barista from any member who signed up. Granting execute to
--   `authenticated` would therefore mean: any member who learns any code (over
--   a shoulder, from a screenshot, from a photo of a friend's phone) can burn
--   it. That is strictly worse than the status quo, so validate_reward_code is
--   granted to service_role ONLY and is unreachable from the mobile client.
--   Redemption at the register goes through a trusted server context (an edge
--   function behind partner credentials, or an operator console) that holds the
--   service key. p_redeemed_by is passed in BY that caller — it is an
--   attribution field, not an authorization check, and this migration does not
--   pretend otherwise. When a real staff role exists, the grant widens to it
--   and p_redeemed_by becomes derivable from auth.uid() instead of trusted.
--
-- DELIBERATE, DOCUMENTED SEMANTICS:
--   * redeem_reward() is now IDEMPOTENT rather than fatal on repeat. It
--     previously raised 'You already redeemed this reward' on a second call.
--     That was safe (user_rewards_unique already prevented the double-spend)
--     but it stranded the member: a redemption whose pass sheet was dismissed,
--     or whose app was reinstalled, left points spent and the code unreachable
--     forever. A repeat call now returns the EXISTING pass — same code, same
--     expiry, already_redeemed = true — and spends nothing. The double-spend
--     guarantee is unchanged and still enforced two independent ways: the
--     early-return path is taken under the same profile row lock the spend
--     path uses, and user_rewards_unique (user_id, reward_id) from 0006 remains
--     as the backstop if that check were ever bypassed.
--   * Codes use a 32-symbol alphabet: digits 2-9 plus A-Z without I and O.
--     Those are the characters a human misreads off a phone screen and mistypes
--     into a till when the scanner fails (O/0, I/1). Exactly 32 symbols is also
--     what makes the byte -> symbol mapping unbiased, so the exclusion list is
--     fixed at five. 12 symbols = 60 bits of entropy, which makes online
--     guessing against a single-use, expiring token irrelevant.
--   * A code's status is a strict one-way progression: 'issued' -> 'redeemed'
--     (burned at the register) or 'issued' -> 'void' (support reversal). It is
--     never walked backwards. 'expired' is a materialized end state; the source
--     of truth for expiry is the expires_at TIMESTAMP compared at validation
--     time, NOT the status column, so a pass that has aged out is refused even
--     if no sweep has run to relabel it.
--   * The TTL is configurable by REPLACING reward_code_ttl_days() rather than
--     by a client-supplied argument, so a caller can never ask for a longer
--     window than ops intends. Default 30 days.

-- pgcrypto supplies gen_random_bytes. Supabase installs it into `extensions`;
-- the functions below put that schema on their search_path explicitly rather
-- than relying on the session default.
create extension if not exists pgcrypto;

-- ===========================================================================
-- 1. reward_redemptions — one row per issued pass.
-- ===========================================================================
create table public.reward_redemptions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  reward_id    uuid        not null references public.rewards (id) on delete cascade,
  code         text        not null,
  status       text        not null default 'issued',
  issued_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  redeemed_at  timestamptz,
  -- Nullable and untyped-by-reference on purpose: there is no merchants/staff
  -- table yet, so this records whatever identifier the trusted caller supplies
  -- (store code, operator email). A FK here would be a lie about a table that
  -- does not exist. See the trust-model note in the header.
  redeemed_by  text,
  points_spent integer     not null,
  constraint reward_redemptions_status_valid
    check (status in ('issued', 'redeemed', 'expired', 'void')),
  constraint reward_redemptions_points_nonnegative check (points_spent >= 0),
  constraint reward_redemptions_code_shape check (code ~ '^[A-Z2-9]{8,16}$'),
  -- redeemed_at is set if and only if the pass was actually burned.
  constraint reward_redemptions_redeemed_at_matches_status
    check ((status = 'redeemed') = (redeemed_at is not null)),
  constraint reward_redemptions_expiry_after_issue check (expires_at > issued_at)
);

-- The code is the bearer credential: it must be globally unique, and the
-- validation path looks a pass up by code alone, so this index is on the hot
-- path of every scan at a register.
create unique index reward_redemptions_code_unique
  on public.reward_redemptions (code);

-- "My passes, newest first" — the only query the client ever runs.
create index reward_redemptions_user_issued
  on public.reward_redemptions (user_id, issued_at desc);

comment on table public.reward_redemptions is
  'One server-issued redemption pass per reward redemption. code is an unguessable bearer credential generated from gen_random_bytes; possession of it is what a partner honours. Written ONLY by redeem_reward()/validate_reward_code() (SECURITY DEFINER) — the client has no insert/update/delete policy.';

comment on column public.reward_redemptions.redeemed_by is
  'Free-text attribution for who burned the pass (store code, operator email), supplied by the trusted service_role caller. NOT an authorization check and not a foreign key: no staff/merchant table exists yet.';

alter table public.reward_redemptions enable row level security;

-- Read your OWN passes only. There is deliberately no "read all" policy as
-- there is on challenge_results (0019): a challenge result is public
-- information, whereas another member's code is a spendable credential.
create policy "read own reward redemptions"
  on public.reward_redemptions
  for select
  using (user_id = auth.uid());

-- ===========================================================================
-- 2. Code generation.
-- ===========================================================================

-- Configurable TTL. Ops changes the window by `create or replace`-ing this
-- function; no caller passes a TTL, so no caller can widen its own window.
create or replace function public.reward_code_ttl_days()
returns integer
language sql
immutable
as $$ select 30 $$;

comment on function public.reward_code_ttl_days() is
  'How long an issued reward pass stays valid, in days. Replace this function to change the window; it is deliberately not a caller-supplied argument.';

-- Draws one unguessable code. Private helper: revoked from everyone, called
-- only from issue_reward_code() below.
create or replace function public.generate_reward_code(p_length integer default 12)
returns text
language plpgsql
volatile
set search_path = public, extensions, pg_temp
as $$
declare
  -- Exactly 32 symbols, so each random byte maps onto the alphabet with NO
  -- modulo bias (256 is an exact multiple of 32). The five excluded characters
  -- are O/0 and I/1/L-adjacent digits: the pairs a human confuses when reading
  -- a code off a phone screen and typing it into a till. Landing on exactly 32
  -- is what buys the unbiased mapping, so the exclusion list is fixed.
  c_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea;
  v_out   text := '';
  i       integer;
begin
  v_bytes := extensions.gen_random_bytes(p_length);
  for i in 0 .. p_length - 1 loop
    v_out := v_out || substr(c_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_out;
end;
$$;

-- `revoke ... from public` alone is NOT sufficient on Supabase: the platform
-- grants EXECUTE on functions in the `public` schema to the `anon` and
-- `authenticated` roles via default privileges, and revoking from PUBLIC does
-- not remove a grant held by a specific role. Both roles must be named
-- explicitly — the same belt-and-braces every other function in 0020/0023 uses.
revoke all on function public.generate_reward_code(integer) from public;
revoke all on function public.generate_reward_code(integer) from anon, authenticated;

-- Issues a pass row for an already-recorded spend. This function does NOT
-- touch points: it is called from INSIDE redeem_reward()'s transaction, after
-- that function has done the one and only point deduction. Keeping issuance
-- here rather than inlining it means validate/void logic and the spend logic
-- stay in one place each.
create or replace function public.issue_reward_code(
  p_user_id      uuid,
  p_reward_id    uuid,
  p_points_spent integer
)
returns public.reward_redemptions
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row  public.reward_redemptions;
  v_code text;
begin
  -- Retry on the (vanishingly unlikely) unique collision rather than failing
  -- the member's redemption. 60 bits of entropy makes a collision a
  -- theoretical concern only, but a bearer token generator that can hard-fail
  -- a committed spend is not acceptable, so the loop exists.
  for i in 1 .. 5 loop
    v_code := public.generate_reward_code(12);
    begin
      insert into public.reward_redemptions
        (user_id, reward_id, code, expires_at, points_spent)
      values
        (p_user_id, p_reward_id, v_code,
         now() + make_interval(days => public.reward_code_ttl_days()),
         p_points_spent)
      returning * into v_row;
      return v_row;
    exception when unique_violation then
      -- Draw again.
    end;
  end loop;

  raise exception 'Could not issue a redemption code. Please try again.';
end;
$$;

-- CRITICAL: this function issues a redeemable pass and deliberately performs NO
-- point deduction, because redeem_reward() has already done it. If a client role
-- could call it directly, a user could mint unlimited free passes without ever
-- spending points. `from public` does not cover Supabase's role-specific default
-- grants, so anon and authenticated are revoked by name.
revoke all on function public.issue_reward_code(uuid, uuid, integer) from public;
revoke all on function public.issue_reward_code(uuid, uuid, integer) from anon, authenticated;

comment on function public.issue_reward_code(uuid, uuid, integer) is
  'Issues one reward_redemptions row with a fresh unguessable code. Called only from redeem_reward() inside its transaction; performs NO point deduction of its own.';

-- ===========================================================================
-- 3. redeem_reward() — extended, not duplicated.
--
--    The spend logic below is byte-for-byte the 0006 logic (same checks, same
--    row lock, same ledger event, same user_rewards insert). The ONLY changes
--    are (a) the already-redeemed branch now returns the existing pass instead
--    of raising, and (b) the successful path calls issue_reward_code() before
--    returning. The return signature grows, so the old function is dropped
--    first — Postgres cannot `create or replace` across a changed OUT list.
-- ===========================================================================
drop function if exists public.redeem_reward(uuid);

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

  -- Lock the profile row FIRST. In 0006 this lock only guarded the balance
  -- check; it now also serializes the already-redeemed check below, so two
  -- concurrent calls cannot both miss the existing row and both spend.
  select points into v_balance from public.profiles where id = v_user for update;
  if v_balance is null then
    raise exception 'Your account profile is missing';
  end if;

  -- Idempotent replay: this member already redeemed this reward. Spend nothing
  -- and hand back the pass that spend already bought. Returning the existing
  -- pass (rather than raising, as 0006 did) is what makes a dismissed sheet or
  -- a reinstalled app recoverable instead of a silently forfeited purchase.
  select ur.id into v_ur_id
  from public.user_rewards ur
  where ur.user_id = v_user and ur.reward_id = p_reward_id;

  if v_ur_id is not null then
    select * into v_pass
    from public.reward_redemptions r
    where r.user_id = v_user and r.reward_id = p_reward_id
    order by r.issued_at desc
    limit 1;

    -- Redemptions made BEFORE this migration have no pass row at all. Issue
    -- one now: those members really did spend points, so backfilling on read
    -- is the only way to make them whole without a bulk migration that would
    -- burn 30-day TTLs on passes nobody has opened yet.
    if v_pass.id is null then
      select ur.points_spent into v_cost from public.user_rewards ur where ur.id = v_ur_id;
      v_pass := public.issue_reward_code(v_user, p_reward_id, coalesce(v_cost, 0));
    end if;

    return query
      select v_balance, v_ur_id, v_pass.code, v_pass.expires_at, v_pass.status, true;
    return;
  end if;

  -- Not yet redeemed: the catalog listing must still be live. (Checked here
  -- rather than above so an expired/withdrawn reward never blocks a member
  -- from re-opening a pass they already paid for.)
  if not v_active then
    raise exception 'This reward is no longer available';
  end if;
  if v_expiry is not null and v_expiry < current_date then
    raise exception 'This reward has expired';
  end if;
  if v_balance < v_cost then
    raise exception 'Not enough points to redeem this reward';
  end if;

  -- Negative points event; leaderboard_delta stays 0 so spending never drops rank.
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

  -- Same transaction as the spend: a committed deduction always has a pass.
  v_pass := public.issue_reward_code(v_user, p_reward_id, v_cost);

  select points into v_balance from public.profiles where id = v_user;
  return query
    select v_balance, v_ur_id, v_pass.code, v_pass.expires_at, v_pass.status, false;
end;
$$;

revoke all on function public.redeem_reward(uuid) from public;
grant execute on function public.redeem_reward(uuid) to authenticated;

comment on function public.redeem_reward(uuid) is
  'Atomic reward redemption: appends a negative points ledger event, decrements the cached balance under a row lock, records the user_reward, and issues an unguessable server-generated pass code — all in one transaction. Idempotent: a repeat call spends nothing and returns the existing pass with already_redeemed = true.';

-- ===========================================================================
-- 4. validate_reward_code() — burn a pass at the register, exactly once.
--    service_role ONLY. See the header for why this is not granted to
--    `authenticated` and what would have to exist before it could be.
-- ===========================================================================
create or replace function public.validate_reward_code(
  p_code        text,
  p_redeemed_by text default null
)
returns table (
  redemption_id uuid,
  reward_id     uuid,
  partner_name  text,
  description   text,
  user_id       uuid,
  points_spent  integer,
  redeemed_at   timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row public.reward_redemptions;
begin
  if p_code is null then
    raise exception 'No code supplied';
  end if;

  -- Normalize the way a till operator types: trim, upcase, drop the grouping
  -- dashes/spaces the UI adds for readability. The stored code has none.
  select * into v_row
  from public.reward_redemptions r
  where r.code = regexp_replace(upper(btrim(p_code)), '[^A-Z0-9]', '', 'g')
  for update;

  if v_row.id is null then
    raise exception 'Unknown redemption code';
  end if;

  if v_row.status = 'redeemed' then
    raise exception 'This pass was already redeemed on %',
      to_char(v_row.redeemed_at, 'YYYY-MM-DD HH24:MI');
  end if;

  if v_row.status = 'void' then
    raise exception 'This pass has been voided';
  end if;

  -- The TIMESTAMP is the source of truth, not the status column: a pass that
  -- aged out is refused whether or not a sweep has relabelled it yet. The
  -- relabel is a side effect so the member's list stops showing it as active.
  if v_row.expires_at <= now() then
    update public.reward_redemptions
      set status = 'expired'
      where id = v_row.id and status = 'issued';
    raise exception 'This pass expired on %', to_char(v_row.expires_at, 'YYYY-MM-DD');
  end if;

  -- Burn it. The `and status = 'issued'` predicate plus the row lock taken
  -- above make this a single-winner update: a concurrent second scan blocks,
  -- then falls into the 'already redeemed' branch on retry.
  update public.reward_redemptions
    set status      = 'redeemed',
        redeemed_at = now(),
        redeemed_by = p_redeemed_by
    where id = v_row.id and status = 'issued'
    returning * into v_row;

  if v_row.id is null then
    raise exception 'This pass was already redeemed';
  end if;

  return query
    select v_row.id, v_row.reward_id, rw.partner_name, rw.description,
           v_row.user_id, v_row.points_spent, v_row.redeemed_at
    from public.rewards rw
    where rw.id = v_row.reward_id;
end;
$$;

revoke all on function public.validate_reward_code(text, text) from public;
-- Both client roles named explicitly: `from public` does not remove Supabase's
-- role-specific default grants, and anon was previously left out.
revoke all on function public.validate_reward_code(text, text) from anon, authenticated;
grant execute on function public.validate_reward_code(text, text) to service_role;

comment on function public.validate_reward_code(text, text) is
  'Burns a redemption pass exactly once and returns what was redeemed. service_role ONLY — there is no staff/merchant role in this app yet, so granting this to authenticated would let any member burn any code they glimpsed. p_redeemed_by is trusted attribution supplied by the caller, not an authorization check.';

-- ===========================================================================
-- 5. Housekeeping sweep. Expiry is enforced at validation time regardless;
--    this only relabels aged-out passes so the member's list stops presenting
--    them as active. Safe to run on any schedule, or never.
-- ===========================================================================
create or replace function public.expire_reward_codes()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.reward_redemptions
    set status = 'expired'
    where status = 'issued' and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_reward_codes() from public;
revoke all on function public.expire_reward_codes() from anon, authenticated;
grant execute on function public.expire_reward_codes() to service_role;

comment on function public.expire_reward_codes() is
  'Relabels aged-out issued passes as expired. Cosmetic only: validate_reward_code() compares expires_at directly, so an unswept pass is still refused.';
