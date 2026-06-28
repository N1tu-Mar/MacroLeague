-- Phase 1 security hardening.
--
-- Forward-only and ADDITIVE on top of 0001-0007. It never edits earlier
-- migrations. It closes a privilege/economy-escalation hole and adds two
-- defense-in-depth measures. No schema columns are added or removed; this only
-- replaces a function and tightens function-execute privileges.
--
-- ===========================================================================
-- VULNERABILITY CLOSED (economy escalation via user-owned rule sets)
-- ===========================================================================
-- Migration 0005 correctly made XP/points/streak columns un-writable by the
-- client (column-level UPDATE revoked; only the SECURITY DEFINER trigger writes
-- them). Migration 0006 then let the award trigger read the AWARD AMOUNTS and
-- THRESHOLDS from gamification_rule_sets, and added RLS letting a user INSERT/
-- UPDATE their OWN default rule set ("insert own rule sets" / "update own rule
-- sets", scope='individual', owner_user_id = auth.uid()). The 0006 trigger
-- PREFERRED the user's own rule set over the system one.
--
-- Net effect: a user could bypass the app UI, write their own rule set with, e.g.
--   {"xp":{"per_meal":1000000},"leaderboard":{"per_meal":1000000},
--    "meal_count":{"enabled":true,"required":1},"protein_goal":{"min_pct":0}}
-- and then a single meal_logs insert would award arbitrary XP, arbitrary
-- redeemable points, and arbitrary leaderboard_delta — inflating their global
-- leaderboard rank and challenge standings and letting them redeem every reward.
-- The intended feature (the RuleSettings screen) only ever lets a user toggle
-- modules ON/OFF; the amounts were never meant to be client-controlled.
--
-- FIX (principle: a user rule set may only NARROW, never inflate):
--   * ALL award amounts (xp/points/leaderboard per event), streak milestones, and
--     macro-accuracy bands are read ONLY from the trusted SYSTEM default rule set.
--   * A module is EFFECTIVELY ENABLED only when the SYSTEM enables it AND the user
--     has not disabled it (system_enabled AND coalesce(user_enabled, true)). A user
--     can therefore disable a module for themselves but can never enable one the
--     system turned off.
--   * Thresholds a user could otherwise relax (meal_count.required,
--     protein_goal.min_pct) are taken as greatest(system, user) so a personal value
--     can only make the goal HARDER, never easier.
-- This keeps the RuleSettings toggle feature working while making the scored
-- economy depend solely on the system rule set the client cannot write.
--
-- NOTE: existing ledger rows written before this migration are not rewritten. In a
-- pre-launch database there should be no inflated rows; if the hole was ever
-- exploited, audit gamification_events for outsized *_delta values and reverse
-- them with compensating 'manual_adjustment' rows before launch.

create or replace function public.award_meal_gamification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz             text;
  v_local_date     date;
  v_event_id       uuid;
  v_is_new_day     boolean;
  v_cur_streak     integer;
  v_cur_longest    integer;
  v_prev_date      date;
  v_new_streak     integer;
  v_advance        boolean := false;

  -- TRUSTED economy: the system default rule set (client cannot write scope='system';
  -- "insert own rule sets" RLS only allows scope='individual'). All AMOUNTS,
  -- milestones, and bands come from here and nowhere else.
  v_sys_rules      jsonb;
  -- UNTRUSTED preferences: the user's own default rule set, if any. Used ONLY to
  -- read enable/disable toggles and to make thresholds HARDER (never to set amounts).
  v_user_rules     jsonb;

  v_xp_per_meal    integer;
  v_pts_per_meal   integer;
  v_lb_per_meal    integer;

  -- Effective (system ∧ user) module switches + only-harder thresholds.
  v_mc_enabled     boolean;
  v_mc_required    numeric;
  v_prot_enabled   boolean;
  v_prot_min_pct   numeric;
  v_macro_enabled  boolean;
  v_streak_enabled boolean;

  v_meal_count     integer;
  v_calories       numeric;
  v_protein        numeric;
  v_carbs          numeric;
  v_fat            numeric;
  v_meal_goal_met  boolean;
  v_prot_goal_met  boolean;
  v_macro_goal_met boolean;

  v_goal_cal       integer;
  v_goal_prot      integer;
  v_goal_carbs     integer;

  v_xp_total       integer := 0;
  v_pts_total      integer := 0;

  v_add_cal        numeric := new.calories * new.quantity;
  v_add_prot       numeric := new.protein_g * new.quantity;
  v_add_carbs      numeric := new.carbs_g * new.quantity;
  v_add_fat        numeric := new.fat_g * new.quantity;
begin
  select coalesce(timezone, 'America/New_York') into v_tz
  from public.profiles where id = new.user_id;
  if v_tz is null then
    return new;
  end if;

  v_local_date := (new.eaten_at at time zone v_tz)::date;

  -- Resolve the TRUSTED system economy and the user's (untrusted) preferences
  -- SEPARATELY. Unlike 0006, the user's rule set is never used for amounts.
  select rules into v_sys_rules
  from public.gamification_rule_sets
  where scope = 'system' and is_default
  limit 1;
  if v_sys_rules is null then
    v_sys_rules := '{}'::jsonb;
  end if;

  select rules into v_user_rules
  from public.gamification_rule_sets
  where owner_user_id = new.user_id and is_default
  limit 1;
  -- v_user_rules may be NULL (no personal rule set) — every read below treats a
  -- missing user value as "no preference" (toggle defaults on, threshold ignored).

  -- AMOUNTS: system only.
  v_xp_per_meal  := coalesce((v_sys_rules #>> '{xp,per_meal}')::int, 50);
  v_pts_per_meal := coalesce((v_sys_rules #>> '{points,per_meal}')::int, 10);
  v_lb_per_meal  := coalesce((v_sys_rules #>> '{leaderboard,per_meal}')::int, 10);

  -- EFFECTIVE module switches = system enabled AND user has not disabled it.
  v_mc_enabled := coalesce((v_sys_rules #>> '{meal_count,enabled}')::boolean, false)
              and coalesce((v_user_rules #>> '{meal_count,enabled}')::boolean, true);
  v_prot_enabled := coalesce((v_sys_rules #>> '{protein_goal,enabled}')::boolean, false)
              and coalesce((v_user_rules #>> '{protein_goal,enabled}')::boolean, true);
  v_macro_enabled := coalesce((v_sys_rules #>> '{macro_accuracy,enabled}')::boolean, false)
              and coalesce((v_user_rules #>> '{macro_accuracy,enabled}')::boolean, true);
  v_streak_enabled := coalesce((v_sys_rules #>> '{streak,enabled}')::boolean, false)
              and coalesce((v_user_rules #>> '{streak,enabled}')::boolean, true);

  -- THRESHOLDS the user may only make HARDER: greatest(system, user). A user value
  -- lower than the system floor is ignored; a higher one self-imposes a tougher goal.
  v_mc_required := greatest(
    coalesce((v_sys_rules  #>> '{meal_count,required}')::numeric, 3),
    coalesce((v_user_rules #>> '{meal_count,required}')::numeric, 0)
  );
  v_prot_min_pct := greatest(
    coalesce((v_sys_rules  #>> '{protein_goal,min_pct}')::numeric, 100),
    coalesce((v_user_rules #>> '{protein_goal,min_pct}')::numeric, 0)
  );

  -- (a) Idempotent base award. A replay (same meal) inserts nothing, so we return
  -- before touching counters/streak/rules. This is the single idempotency gate.
  insert into public.gamification_events
    (user_id, event_type, source_type, source_id, xp_delta, points_delta,
     leaderboard_delta, source_local_date, timezone, metadata)
  values
    (new.user_id, 'meal_logged', 'meal_log', new.id, v_xp_per_meal, v_pts_per_meal,
     v_lb_per_meal, v_local_date, v_tz,
     jsonb_build_object('meal_source', coalesce(new.source, 'manual'), 'activity_date', v_local_date))
  on conflict (user_id, event_type, source_type, source_id) where source_id is not null
  do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return new;
  end if;

  v_xp_total  := v_xp_total + v_xp_per_meal;
  v_pts_total := v_pts_total + v_pts_per_meal;

  -- (b) Upsert the local-day row: bump meal_count + accumulate macro totals.
  insert into public.user_daily_activity
    (user_id, activity_date, timezone, meal_count, calories, protein_g, carbs_g, fat_g,
     first_logged_at, last_logged_at)
  values
    (new.user_id, v_local_date, v_tz, 1, v_add_cal, v_add_prot, v_add_carbs, v_add_fat,
     new.eaten_at, new.eaten_at)
  on conflict (user_id, activity_date) do update
    set meal_count      = public.user_daily_activity.meal_count + 1,
        calories        = public.user_daily_activity.calories + excluded.calories,
        protein_g       = public.user_daily_activity.protein_g + excluded.protein_g,
        carbs_g         = public.user_daily_activity.carbs_g + excluded.carbs_g,
        fat_g           = public.user_daily_activity.fat_g + excluded.fat_g,
        timezone        = excluded.timezone,
        first_logged_at = least(public.user_daily_activity.first_logged_at, excluded.first_logged_at),
        last_logged_at  = greatest(public.user_daily_activity.last_logged_at, excluded.last_logged_at)
  returning (xmax = 0), meal_count, calories, protein_g, carbs_g, fat_g,
            meal_count_goal_met, protein_goal_met, macro_accuracy_goal_met
    into v_is_new_day, v_meal_count, v_calories, v_protein, v_carbs, v_fat,
         v_meal_goal_met, v_prot_goal_met, v_macro_goal_met;

  select goal_calories, goal_protein_g, goal_carbs_g
    into v_goal_cal, v_goal_prot, v_goal_carbs
  from public.profiles where id = new.user_id;

  -- (c) Meal-count rule: amount from SYSTEM, threshold only-harder, switch effective.
  if v_mc_enabled
     and not v_meal_goal_met
     and v_meal_count >= v_mc_required then
    insert into public.gamification_events
      (user_id, event_type, source_type, source_id, points_delta, leaderboard_delta,
       source_local_date, timezone, metadata)
    values
      (new.user_id, 'meal_count_goal_hit', 'meal_log', new.id,
       coalesce((v_sys_rules #>> '{points,meal_count_goal}')::int, 15),
       coalesce((v_sys_rules #>> '{leaderboard,meal_count_goal}')::int, 15),
       v_local_date, v_tz, jsonb_build_object('meal_count', v_meal_count));
    update public.user_daily_activity
      set meal_count_goal_met = true, meal_count_goal_awarded_at = now()
      where user_id = new.user_id and activity_date = v_local_date;
    v_pts_total := v_pts_total + coalesce((v_sys_rules #>> '{points,meal_count_goal}')::int, 15);
  end if;

  -- (d) Protein rule: amount from SYSTEM, min_pct only-harder, switch effective.
  if v_prot_enabled
     and not v_prot_goal_met
     and v_goal_prot is not null
     and v_protein >= v_goal_prot * v_prot_min_pct / 100.0 then
    insert into public.gamification_events
      (user_id, event_type, source_type, source_id, points_delta, leaderboard_delta,
       source_local_date, timezone, metadata)
    values
      (new.user_id, 'daily_protein_goal_hit', 'meal_log', new.id,
       coalesce((v_sys_rules #>> '{points,protein_goal}')::int, 25),
       coalesce((v_sys_rules #>> '{leaderboard,protein_goal}')::int, 25),
       v_local_date, v_tz, jsonb_build_object('protein_g', v_protein, 'goal_protein_g', v_goal_prot));
    update public.user_daily_activity
      set protein_goal_met = true, protein_goal_awarded_at = now()
      where user_id = new.user_id and activity_date = v_local_date;
    v_pts_total := v_pts_total + coalesce((v_sys_rules #>> '{points,protein_goal}')::int, 25);
  end if;

  -- (e) Macro-accuracy rule: amount AND bands from SYSTEM only; switch effective.
  if v_macro_enabled
     and not v_macro_goal_met
     and v_goal_cal is not null and v_goal_prot is not null and v_goal_carbs is not null
     and v_calories >= v_goal_cal  * coalesce((v_sys_rules #>> '{macro_accuracy,calories,low_pct}')::numeric, 90)  / 100.0
     and v_calories <= v_goal_cal  * coalesce((v_sys_rules #>> '{macro_accuracy,calories,high_pct}')::numeric, 110) / 100.0
     and v_protein  >= v_goal_prot * coalesce((v_sys_rules #>> '{macro_accuracy,protein,low_pct}')::numeric, 100)  / 100.0
     and v_protein  <= v_goal_prot * coalesce((v_sys_rules #>> '{macro_accuracy,protein,high_pct}')::numeric, 1000) / 100.0
     and v_carbs    >= v_goal_carbs * coalesce((v_sys_rules #>> '{macro_accuracy,carbs,low_pct}')::numeric, 80)    / 100.0
     and v_carbs    <= v_goal_carbs * coalesce((v_sys_rules #>> '{macro_accuracy,carbs,high_pct}')::numeric, 120)  / 100.0 then
    insert into public.gamification_events
      (user_id, event_type, source_type, source_id, points_delta, leaderboard_delta,
       source_local_date, timezone, metadata)
    values
      (new.user_id, 'daily_macro_accuracy_hit', 'meal_log', new.id,
       coalesce((v_sys_rules #>> '{points,macro_accuracy}')::int, 30),
       coalesce((v_sys_rules #>> '{leaderboard,macro_accuracy}')::int, 30),
       v_local_date, v_tz, jsonb_build_object('calories', v_calories, 'protein_g', v_protein, 'carbs_g', v_carbs));
    update public.user_daily_activity
      set macro_accuracy_goal_met = true, macro_accuracy_awarded_at = now()
      where user_id = new.user_id and activity_date = v_local_date;
    v_pts_total := v_pts_total + coalesce((v_sys_rules #>> '{points,macro_accuracy}')::int, 30);
  end if;

  -- (f) Streak: amount + milestones from SYSTEM; switch effective. Same forward-only
  -- once-per-local-day rule as 0005/0006.
  if v_is_new_day then
    select streak_count, longest_streak, last_activity_date
      into v_cur_streak, v_cur_longest, v_prev_date
    from public.profiles where id = new.user_id
    for update;

    if v_prev_date is null or v_local_date > v_prev_date then
      if v_prev_date is not null and v_local_date = v_prev_date + 1 then
        v_new_streak := v_cur_streak + 1;
      else
        v_new_streak := 1;
      end if;
      v_advance := true;

      update public.user_daily_activity
        set qualified_for_streak = true
        where user_id = new.user_id and activity_date = v_local_date;

      if v_streak_enabled
         and (v_sys_rules #> '{streak,milestones}') @> to_jsonb(v_new_streak) then
        insert into public.gamification_events
          (user_id, event_type, source_type, source_id, points_delta, leaderboard_delta,
           source_local_date, timezone, metadata)
        values
          (new.user_id, 'streak_milestone', 'streak', new.id,
           coalesce((v_sys_rules #>> '{points,streak_milestone}')::int, 100),
           coalesce((v_sys_rules #>> '{leaderboard,streak_milestone}')::int, 50),
           v_local_date, v_tz, jsonb_build_object('streak', v_new_streak));
        v_pts_total := v_pts_total + coalesce((v_sys_rules #>> '{points,streak_milestone}')::int, 100);
      end if;
    end if;
  end if;

  -- (g) Single rollup onto profiles.
  update public.profiles
  set xp                 = xp + v_xp_total,
      points             = points + v_pts_total,
      total_meals_logged = total_meals_logged + 1,
      streak_count       = case when v_advance then v_new_streak else streak_count end,
      longest_streak     = case when v_advance then greatest(longest_streak, v_new_streak) else longest_streak end,
      last_activity_date = case when v_advance then v_local_date else last_activity_date end,
      updated_at         = now()
  where id = new.user_id;

  return new;
end;
$$;

comment on function public.award_meal_gamification() is
  'Database-owned, idempotent meal award + data-driven daily rule engine. HARDENED in 0008: all award AMOUNTS, streak milestones, and macro bands come ONLY from the system default rule set; a user-owned rule set can only DISABLE modules or make meal_count/protein thresholds harder (greatest(system,user)), never inflate awards. Awards base XP/points once per meal, accumulates the day''s macros, evaluates the effective meal-count/protein/macro-accuracy modules (each at most once per local day), advances the logging streak, and emits streak milestones.';

-- ===========================================================================
-- DEFENSE IN DEPTH 1: lock down the SECURITY DEFINER trigger functions so they
-- cannot be invoked directly by clients. Trigger execution does not depend on the
-- invoking role holding EXECUTE, so revoking it from the client roles is safe and
-- only removes a needless privilege-escalation surface (a definer function callable
-- as `select public.fn()`). The table owner / service_role are unaffected.
-- ===========================================================================
revoke execute on function public.award_meal_gamification() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
