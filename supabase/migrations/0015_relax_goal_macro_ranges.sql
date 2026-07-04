-- 0015_relax_goal_macro_ranges.sql
--
-- Remove the hard nutritional guardrails on macro GOALS. The original schema
-- (0001) hard-rejected any goal set where carbs weren't 45–65% of calories or
-- unsaturated fat was under 10% of calories, and required protein >= 50g. Those
-- rules made whole legitimate diet styles impossible to configure (keto /
-- low-carb, low-fat, very high-carb) and caused a client/DB mismatch (the client
-- allowed carbs down to 25% while the DB required 45%, so those saves failed with
-- a raw database error). A user's personal macro targets should never be
-- hard-blocked — the app nudges, it does not forbid.
--
-- We keep only non-negativity (a negative goal is nonsensical) and the fixed
-- trans-fat-zero rule (the app always stores 0 there). Idempotent so it is safe
-- to re-run.

alter table profiles drop constraint if exists profiles_goal_carbs_energy_range;
alter table profiles drop constraint if exists profiles_goal_unsaturated_fat_min;
alter table profiles drop constraint if exists profiles_goal_protein_min;

alter table profiles drop constraint if exists profiles_goal_protein_nonneg;
alter table profiles drop constraint if exists profiles_goal_carbs_nonneg;
alter table profiles drop constraint if exists profiles_goal_unsaturated_fat_nonneg;

alter table profiles
  add constraint profiles_goal_protein_nonneg
    check (goal_protein_g is null or goal_protein_g >= 0),
  add constraint profiles_goal_carbs_nonneg
    check (goal_carbs_g is null or goal_carbs_g >= 0),
  add constraint profiles_goal_unsaturated_fat_nonneg
    check (goal_unsaturated_fat_g is null or goal_unsaturated_fat_g >= 0);
