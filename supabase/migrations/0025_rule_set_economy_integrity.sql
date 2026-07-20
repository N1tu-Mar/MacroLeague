-- Rule-set economy integrity: users may tune their OWN targets, never their own payouts.
--
-- Forward-only and ADDITIVE on top of 0001-0024.
--
-- ---------------------------------------------------------------------------
-- THE DEFECT
-- ---------------------------------------------------------------------------
-- 0006 introduced per-user rule sets. The award trigger picks the caller's rule
-- set when one exists:
--
--     from public.gamification_rule_sets
--     where (owner_user_id = new.user_id or scope = 'system') and is_default
--
-- and the RLS insert policy lets a user create exactly such a row:
--
--     with check (owner_user_id = auth.uid() and scope = 'individual')
--
-- The `rules` jsonb is NOT constrained, so a user could write ANY value into it.
-- The RuleSettings screen only exposes module toggles and thresholds, but the
-- policy — not the screen — is the security boundary, and a direct PostgREST
-- call could set:
--
--     rules -> 'leaderboard' -> 'per_meal'  = 100000
--
-- Every subsequent meal would then award a hand-picked leaderboard_delta. Since
-- leaderboard_delta is exactly what the global leaderboard, the challenge
-- standings and finalize_challenge() all sum, this is a direct write to the
-- competitive ranking — while every honest user is scored on the system rules.
--
-- Even without touching payouts, `meal_count.required = 1` and
-- `protein_goal.min_pct = 1` make every daily bonus trivially attainable.
--
-- ---------------------------------------------------------------------------
-- THE FIX, AND WHY IT IS SHAPED THIS WAY
-- ---------------------------------------------------------------------------
-- A BEFORE INSERT OR UPDATE trigger normalizes every non-system rule set:
--
--   1. ECONOMY IS OVERWRITTEN, NOT VALIDATED. The 'xp', 'points' and
--      'leaderboard' blocks are replaced outright with the system default's.
--      Rejecting bad values would leave the door open to whatever shape we
--      failed to anticipate; overwriting means a personal rule set CANNOT carry
--      a payout at all, whatever the client sends.
--
--   2. THRESHOLDS ARE CLAMPED IN THE HARDER DIRECTION ONLY. A user may make
--      their own goals harder (require 5 meals instead of 3, 110% protein
--      instead of 100%) but never easier than the system baseline. Personal
--      goals stay a real feature; they just cannot be used to lower the bar for
--      the same rewards.
--
--   3. MODULES MAY BE DISABLED. Turning a module off only forfeits its award, so
--      it can never be an advantage and is left alone.
--
-- This deliberately does NOT modify award_meal_gamification() from 0006. That
-- function keeps reading the user's rule set exactly as before; the values it
-- can now find there are simply always safe. Rewriting the award path would put
-- the app's most sensitive trigger at risk to fix a data-integrity problem that
-- belongs at the write boundary.
--
-- EXISTING ROWS ARE REPAIRED at the bottom, so anyone who already saved a
-- personal rule set (through the UI or otherwise) is normalized on deploy.

-- ===========================================================================
-- 1. The system baseline, in one place.
-- ===========================================================================
create or replace function public.system_default_rules()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select rules
  from public.gamification_rule_sets
  where scope = 'system' and is_default
  limit 1;
$$;

revoke all on function public.system_default_rules() from public;
revoke all on function public.system_default_rules() from anon, authenticated;

-- ===========================================================================
-- 2. Normalizer.
-- ===========================================================================
create or replace function public.normalize_rule_set()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_system        jsonb := public.system_default_rules();
  v_rules         jsonb;
  v_sys_required  integer;
  v_sys_min_pct   integer;
  v_new_required  integer;
  v_new_min_pct   integer;
begin
  -- The system rule set itself is maintained by migrations, not by users.
  if new.scope = 'system' then
    return new;
  end if;

  -- No system baseline (fresh environment mid-migration): fail closed by
  -- refusing the personal rule set rather than accepting an unconstrained one.
  if v_system is null then
    raise exception 'No system default rule set; cannot validate a personal rule set.';
  end if;

  v_rules := coalesce(new.rules, '{}'::jsonb);

  -- (1) Economy blocks are the system's, always. Not merged — replaced.
  v_rules := v_rules
    || jsonb_build_object('xp',          v_system -> 'xp')
    || jsonb_build_object('points',      v_system -> 'points')
    || jsonb_build_object('leaderboard', v_system -> 'leaderboard')
    -- macro_accuracy carries the tolerance BANDS that decide whether a day
    -- qualifies. Widening them is the same exploit in a different shape, so the
    -- whole block follows the system's, except for its enabled flag (below).
    || jsonb_build_object(
         'macro_accuracy',
         (v_system -> 'macro_accuracy')
           || jsonb_build_object(
                'enabled',
                coalesce(v_rules -> 'macro_accuracy' -> 'enabled', 'true'::jsonb)
              )
       );

  -- (2) Thresholds may only move in the harder direction.
  v_sys_required := coalesce((v_system -> 'meal_count' ->> 'required')::integer, 3);
  v_new_required := coalesce((v_rules  -> 'meal_count' ->> 'required')::integer, v_sys_required);

  v_sys_min_pct  := coalesce((v_system -> 'protein_goal' ->> 'min_pct')::integer, 100);
  v_new_min_pct  := coalesce((v_rules  -> 'protein_goal' ->> 'min_pct')::integer, v_sys_min_pct);

  v_rules := v_rules
    || jsonb_build_object(
         'meal_count',
         coalesce(v_rules -> 'meal_count', '{}'::jsonb)
           || jsonb_build_object(
                -- Upper bound is a sanity guard, not a policy: without it a user
                -- could set 10000 and permanently break their own bonus.
                'required', least(greatest(v_new_required, v_sys_required), 20)
              )
       )
    || jsonb_build_object(
         'protein_goal',
         coalesce(v_rules -> 'protein_goal', '{}'::jsonb)
           || jsonb_build_object(
                'min_pct', least(greatest(v_new_min_pct, v_sys_min_pct), 300)
              )
       );

  -- (3) Streak milestones decide when the (system-valued) streak award fires.
  --     Users cannot invent their own milestone schedule.
  v_rules := v_rules
    || jsonb_build_object(
         'streak',
         (v_system -> 'streak')
           || jsonb_build_object(
                'enabled',
                coalesce(v_rules -> 'streak' -> 'enabled', 'true'::jsonb)
              )
       );

  new.rules := v_rules;
  return new;
end;
$$;

-- The trigger fires regardless of EXECUTE privilege, so revoking here costs
-- nothing and removes the function as a directly callable surface.
revoke all on function public.normalize_rule_set() from public;
revoke all on function public.normalize_rule_set() from anon, authenticated;

drop trigger if exists normalize_rule_set_trg on public.gamification_rule_sets;
create trigger normalize_rule_set_trg
  before insert or update on public.gamification_rule_sets
  for each row
  execute function public.normalize_rule_set();

comment on function public.normalize_rule_set() is
  'Forces every non-system rule set onto the system economy and clamps its '
  'thresholds so they can only be harder than the baseline. A user may tune '
  'their own targets; they can never tune their own payouts.';

-- ===========================================================================
-- 3. Repair rows written before this trigger existed.
--
-- The trigger fires BEFORE UPDATE, so a self-assignment (`set rules = rules`) is
-- enough to route every existing row through the normalizer — the trigger
-- rewrites NEW.rules before the row is stored. This table has no updated_at
-- column (see 0006), so there is nothing else to touch.
--
-- Guarded on the system default existing, because the normalizer raises without
-- it and would abort the whole migration.
-- ===========================================================================
do $$
declare
  v_count integer;
begin
  if exists (select 1 from public.gamification_rule_sets where scope = 'system' and is_default) then
    update public.gamification_rule_sets
      set rules = rules
      where scope <> 'system';
    get diagnostics v_count = row_count;
    raise notice 'normalize_rule_set: repaired % personal rule set(s)', v_count;
  else
    raise notice 'normalize_rule_set: no system default found; skipped repair';
  end if;
end;
$$;
