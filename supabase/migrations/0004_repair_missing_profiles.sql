-- Repair missing profiles.
--
-- The original auth trigger (migration 0001) creates a public.profiles row only
-- when a NEW auth.users row is inserted. Any account created before that trigger
-- was installed therefore has NO matching profile, which makes the Meal Logger's
-- singular profile read fail with HTTP 406 / PGRST116 ("Your account profile is
-- missing.").
--
-- This migration is forward-only and idempotent. It:
--   1. Re-asserts the database-owned profile-creation path (function + trigger).
--   2. Backfills a profile for every existing auth user that is missing one.
-- It never touches existing profiles, their goals, or their usernames.

-- ---------------------------------------------------------------------------
-- 1. Re-assert the profile-creation function.
--    `create or replace` keeps a single database-owned path for new signups.
--    `security definer` + a pinned `search_path` are required because the
--    function inserts into public.profiles while running from the auth schema's
--    insert trigger. `on conflict (id) do nothing` makes retried inserts safe.
--
--    The username is derived deterministically from the user's UUID:
--      'user_' || first 24 hex digits of the id  -> 29 chars (within 3-30),
--    which never exposes the email, is effectively collision-free, and satisfies
--    the unique username constraint.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'user_' || substr(replace(new.id::text, '-', ''), 1, 24))
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Profiles are created by the auth trigger so signup has one database-owned path and retried inserts are harmless.';

-- ---------------------------------------------------------------------------
-- 2. Ensure the trigger exists and calls the function above.
--    Only the on_auth_user_created trigger is dropped/recreated so unrelated
--    auth triggers are left untouched.
-- ---------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3. Backfill profiles for pre-existing auth users.
--    The trigger only fires for FUTURE inserts, so accounts created before the
--    trigger existed still have no profile. We insert one row per orphaned auth
--    user, reusing the same deterministic username scheme. The NOT EXISTS guard
--    plus `on conflict (id) do nothing` make this safe to run once via the
--    normal migration workflow and leave every existing profile/goal unchanged.
-- ---------------------------------------------------------------------------
insert into public.profiles (id, username)
select
  u.id,
  'user_' || substr(replace(u.id::text, '-', ''), 1, 24)
from auth.users u
where not exists (
  select 1
  from public.profiles p
  where p.id = u.id
)
on conflict (id) do nothing;
