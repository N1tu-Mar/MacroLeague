-- Input hardening: bound the user-writable fields that had NO effective limit
-- and are either shown to OTHER users or fed into the gamification economy.
-- Additive and forward-only; no columns added or dropped.
--
-- Scope is deliberately narrow — only the gaps that existing constraints do NOT
-- already cover:
--   * challenges.name / stakes_text, challenge_participants.team_name and
--     meal_logs.free_text are ALREADY length-checked (migrations 0007 / 0001),
--     so they are intentionally omitted here.
--   * The profiles display fields (0006/0012) are user-writable via column-level
--     UPDATE grants but had no length/format check at all.
--   * meal_logs macro columns only had non-negativity checks; the numeric
--     precision alone still allows e.g. protein_g up to 99999.9, which trivially
--     satisfies every protein / macro-accuracy bonus in
--     award_meal_gamification() from a single insert.
--
-- All bounds sit far above real data (verified against prod: max display_name 17
-- chars, max single-meal calories 511, max protein 50 g), so no existing row is
-- rejected. These are the DB-authoritative gate; the client mirrors them for UX.
--
-- NOTE: this does NOT address per-day meal-count farming (logging many VALID
-- meals for repeated base awards). That needs a rate limit / per-day award cap
-- in the trigger and is a deliberate economy-policy decision left for later.

-- ===========================================================================
-- profiles — user-writable display fields, shown cross-user via the leaderboard
-- / friends / search RPCs. avatar_url is additionally scheme-restricted so a
-- user cannot point every viewer's client at an arbitrary or cleartext host.
-- ===========================================================================
alter table public.profiles
  add constraint profiles_display_name_len
    check (display_name is null or char_length(display_name) <= 60),
  add constraint profiles_university_len
    check (university is null or char_length(university) <= 80),
  add constraint profiles_goal_type_len
    check (goal_type is null or char_length(goal_type) <= 40),
  add constraint profiles_dining_hall_len
    check (preferred_dining_hall is null or char_length(preferred_dining_hall) <= 80),
  add constraint profiles_avatar_url_ok
    check (
      avatar_url is null
      or (char_length(avatar_url) <= 500 and avatar_url ~* '^https://')
    );

-- ===========================================================================
-- meal_logs — generous per-meal magnitude ceilings. No real single meal reaches
-- these, but they stop one insert from auto-satisfying every macro bonus.
-- ===========================================================================
alter table public.meal_logs
  add constraint meal_logs_calories_max check (calories <= 10000),
  add constraint meal_logs_protein_max  check (protein_g <= 1000),
  add constraint meal_logs_carbs_max    check (carbs_g   <= 1000),
  add constraint meal_logs_fat_max      check (fat_g     <= 1000),
  add constraint meal_logs_quantity_max check (quantity  <= 50);
