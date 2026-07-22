-- ===========================================================================
-- 0027 — Close the two remaining economy-integrity holes that let a client
--        forge the "trusted ledger" every prior migration relies on.
--
-- Both prior audits (0006/0008/0014/0024/0025 headers) assert that "a client
-- can never inject leaderboard/points". That is true for the AMOUNTS, but two
-- client-controlled INPUTS were never bounded:
--
--   H1. meal_logs.eaten_at is fully client-controlled with no upper/lower bound.
--       award_meal_gamification() derives the streak/activity DAY from it
--       ((eaten_at at time zone tz)::date). A scripted client can insert one
--       meal per fabricated consecutive date and:
--         * march the logging streak 1..30 in seconds, firing every streak
--           milestone (+100 pts each), and
--         * mint a fresh per-day set of leaderboard_delta / bonus awards for
--           each fake day.
--       There was also no cap on the NUMBER of award-earning meals per day, so
--       even same-day inserts mint unbounded base points (+10 pts / +10 lb ea).
--       Net: arbitrary points/XP/leaderboard -> drain the rewards catalog and
--       win any challenge. This is the single largest remaining hole.
--
--   H2. "update own challenges" (0007) has no column restriction and there is
--       no column-level UPDATE revoke on `challenges`. The creator can UPDATE
--       start_date / end_date / finalized_at directly via PostgREST. They can
--       watch standings, shift the scoring window to a sub-range where they
--       lead, then finalize (0024 lets creators finalize) — forging the win —
--       or set finalized_at early to block settlement. 0019's claim that "only
--       finalize_challenge() ever sets finalized_at" is false at the privilege
--       layer. Fix: revoke UPDATE on the scoring-critical columns; the creator
--       keeps editing benign metadata (name/stakes/etc).
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- H1a — Bound meal_logs.eaten_at and cap award-earning meals per rolling day.
--
-- A BEFORE INSERT trigger (runs before award_meal_gamification, which is an
-- AFTER trigger) is the single choke point for every client meal insert. We
-- keep it deliberately small and tz-agnostic:
--   * eaten_at must be within [now() - 2 days, now() + 1 day]. This still
--     allows logging "yesterday's late dinner" and tolerates client/tz clock
--     skew, but makes it impossible to fabricate the distinct future/past days
--     that the streak + per-day bonus engine keys off of.
--   * At most MEAL_LOG_DAILY_CAP inserts per user in any rolling 24h window.
--     Real heavy users log well under this; a farming script cannot.
-- Rejecting (rather than silently clamping) is intentional: an out-of-window or
-- over-cap insert is not a legitimate app action, and a hard error surfaces the
-- bug/abuse instead of hiding it.
-- ---------------------------------------------------------------------------
create or replace function public.guard_meal_log_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  -- Generous rolling-24h ceiling. Tunable here only (not client-visible).
  c_daily_cap constant integer := 40;
  v_recent    integer;
begin
  -- Anti-backdate / anti-future. Small, symmetric skew allowance.
  if new.eaten_at > now() + interval '1 day' then
    raise exception 'eaten_at cannot be in the future'
      using errcode = 'check_violation';
  end if;
  if new.eaten_at < now() - interval '2 days' then
    raise exception 'eaten_at is too far in the past to log'
      using errcode = 'check_violation';
  end if;

  -- Volume cap: count this user's meals in the trailing 24h. The award trigger
  -- is idempotent per (user, client_request_id), but idempotency does not bound
  -- the number of DISTINCT meals — this does.
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

comment on function public.guard_meal_log_insert() is
  'BEFORE INSERT guard on meal_logs (0027): bounds client-controlled eaten_at to [now()-2d, now()+1d] and caps meals to 40 per rolling 24h, so the streak/leaderboard/points ledger derived from eaten_at cannot be farmed via fabricated days or volume.';

-- Trigger execution does not require the invoking role to hold EXECUTE; revoke
-- it from client roles so the function is not a needless callable surface.
revoke all on function public.guard_meal_log_insert() from public;
revoke all on function public.guard_meal_log_insert() from anon, authenticated;

drop trigger if exists trg_guard_meal_log_insert on public.meal_logs;
create trigger trg_guard_meal_log_insert
  before insert on public.meal_logs
  for each row execute function public.guard_meal_log_insert();

-- ---------------------------------------------------------------------------
-- H2 — Lock down which challenge columns the creator may UPDATE.
--
-- The "update own challenges" RLS policy (0007) authorizes the ROW; column-level
-- privileges decide the COLUMNS. Revoke UPDATE on the scoring-critical columns
-- so a creator can still rename/re-describe a challenge but can never move the
-- scoring window or the finalization flag. finalized_at is written by
-- finalize_challenge() (SECURITY DEFINER, runs as owner/service_role) which is
-- unaffected by client-role column grants.
-- ---------------------------------------------------------------------------
-- Start from a clean slate for the client role, then re-grant only the benign,
-- creator-editable metadata columns.
revoke update on public.challenges from authenticated;

grant update (name, type, goal_type, stakes_text) on public.challenges to authenticated;

-- start_date, end_date, duration_days, finalized_at, created_by, created_at, id
-- are intentionally NOT granted: they define the scoring window / outcome and
-- must only change through vetted RPCs (or not at all).

comment on policy "update own challenges" on public.challenges is
  'Row-level: creator only. Column-level UPDATE is restricted in 0027 to name/type/goal_type/stakes_text; start_date/end_date/duration_days/finalized_at are NOT client-updatable (they define the scoring window and outcome).';

commit;
