-- Fix challenge duration semantics.
--
-- Challenge date ranges are inclusive: scoring starts at start_date 00:00 UTC
-- and stops at the beginning of the day after end_date. The original RPC used
-- start_date + duration_days for end_date, which therefore counted both the
-- start day and an extra final day (a 7-day challenge lasted almost 8 days).

-- Repair rows created by the original RPC without touching nonstandard ranges.
update public.challenges
set end_date = start_date + (duration_days - 1)
where end_date = start_date + duration_days;

create or replace function public.create_challenge(
  p_name text,
  p_type text,
  p_goal_type text,
  p_duration_days integer,
  p_stakes text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_id    uuid;
  v_end   date := current_date + (p_duration_days - 1);
  v_desc  text;
  v_target numeric;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.challenges
    (created_by, name, type, goal_type, stakes_text, duration_days, start_date, end_date)
  values
    (v_user, p_name, p_type, p_goal_type,
     coalesce(nullif(btrim(p_stakes), ''), 'Bragging rights'),
     p_duration_days, current_date, v_end)
  returning id into v_id;

  insert into public.challenge_participants (challenge_id, user_id, team_name)
  values (v_id, v_user, case when p_type = 'solo' then 'Solo' else 'My Team' end);

  if p_goal_type = 'protein' then
    v_desc := 'Hit your daily protein goal'; v_target := p_duration_days;
  elsif p_goal_type = 'meal_count' then
    v_desc := 'Log your meals every day'; v_target := p_duration_days;
  elsif p_goal_type = 'streak' then
    v_desc := 'Keep your logging streak alive'; v_target := p_duration_days;
  else
    v_desc := 'Earn the most league points'; v_target := 500;
  end if;

  insert into public.challenge_goals (challenge_id, goal_type, description, target_value, points_value)
  values (v_id, p_goal_type, v_desc, v_target, 50);

  return v_id;
end;
$$;

revoke all on function public.create_challenge(text, text, text, integer, text) from public;
grant execute on function public.create_challenge(text, text, text, integer, text) to authenticated;

comment on function public.create_challenge(text, text, text, integer, text) is
  'Atomically creates a challenge owned by auth.uid(), enrolls the creator, and seeds a starter goal. The inclusive date range contains exactly p_duration_days calendar days.';
