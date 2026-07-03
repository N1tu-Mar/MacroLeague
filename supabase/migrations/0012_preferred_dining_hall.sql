-- Adds a persisted preferred dining hall to profiles and extends the
-- column-level UPDATE grant established in migration 0006. Additive and
-- forward-only. RLS ("update own profile") already restricts writes to the
-- caller's own row, so no new policy is required.

alter table public.profiles
  add column if not exists preferred_dining_hall text;

-- 0006 granted UPDATE on (display_name, university, goal_type, avatar_url) to
-- authenticated. Re-grant the same allow-list plus the new column so the client
-- can persist the dining hall (gamification counters stay backend-only).
grant update (display_name, university, goal_type, avatar_url, preferred_dining_hall)
  on public.profiles to authenticated;
