-- Default profile pictures: every account should show a real DiceBear avatar
-- from the moment it exists, not just an initials fallback.
--
-- Forward-only and ADDITIVE on top of 0001-0016. It never edits earlier
-- migrations.
--
-- ROOT CAUSE this closes: handle_new_user() (0001) has always inserted profiles
-- with avatar_url left NULL. The client's AvatarPickerSheet (DiceBear "micah"
-- avatars) only ever WRITES avatar_url when a user opens it manually — nothing
-- previously gave an account a picture by default. This migration makes
-- handle_new_user() assign a deterministic avatar at signup, and backfills
-- every pre-existing NULL row the same way, so no account is ever pictureless.
--
-- The seed is the user's own id (stable, unique, never reused) and the tint is
-- chosen from the same 12-color palette src/components/AvatarPickerSheet.tsx
-- offers, picked deterministically via hashtext() so each person gets a
-- consistent-looking default. Users can still change it any time via the
-- picker, which overwrites this default like any other choice.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tints text[] := array[
    'f3dbc9', 'd8e4f2', 'e4d8f0', 'f0d8dc', 'd8e8ea', 'd5e8dc',
    'eae4d0', 'f2e3d0', 'e3e8f2', 'dce8d8', 'f0e8d8', 'd8f0ec'
  ];
  tint text := tints[1 + (abs(hashtext(new.id::text)::bigint) % array_length(tints, 1))];
  default_avatar text := 'https://api.dicebear.com/9.x/micah/png?seed=' || new.id::text
    || '&backgroundColor=' || tint || '&size=160';
begin
  insert into public.profiles (id, username, avatar_url)
  values (new.id, 'user_' || substr(new.id::text, 1, 8), default_avatar)
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Profiles are created by the auth trigger so signup has one database-owned path and retried inserts are harmless. Also seeds a deterministic default DiceBear avatar (migration 0017) so every account has a real profile picture, not just initials.';

-- Backfill accounts created before this migration. Idempotent: only touches
-- rows that still have no picture, using the identical seed/tint formula.
update public.profiles
set avatar_url = 'https://api.dicebear.com/9.x/micah/png?seed=' || id::text
  || '&backgroundColor=' || (array[
      'f3dbc9', 'd8e4f2', 'e4d8f0', 'f0d8dc', 'd8e8ea', 'd5e8dc',
      'eae4d0', 'f2e3d0', 'e3e8f2', 'dce8d8', 'f0e8d8', 'd8f0ec'
    ])[1 + (abs(hashtext(id::text)::bigint) % 12)]
  || '&size=160'
where avatar_url is null;
