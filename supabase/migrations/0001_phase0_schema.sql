create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  goal_calories integer,
  goal_protein_g integer,
  goal_carbs_g integer,
  goal_unsaturated_fat_g integer,
  goal_trans_fat_g integer,
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (char_length(username) between 3 and 30),
  constraint profiles_goal_calories_min check (goal_calories > 1400),
  constraint profiles_goal_protein_min check (goal_protein_g >= 50),
  constraint profiles_goal_carbs_energy_range check (
    goal_carbs_g is null
    or goal_calories is null
    or (
      goal_carbs_g * 4 >= goal_calories * 0.45
      and goal_carbs_g * 4 <= goal_calories * 0.65
    )
  ),
  constraint profiles_goal_unsaturated_fat_min check (
    goal_unsaturated_fat_g is null
    or goal_calories is null
    or goal_unsaturated_fat_g * 9 >= goal_calories * 0.10
  ),
  constraint profiles_goal_trans_fat_zero check (goal_trans_fat_g = 0)
);

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  name text not null,
  serving_desc text not null default '1 serving',
  calories numeric(7,1) not null,
  protein_g numeric(6,1) not null,
  carbs_g numeric(6,1) not null,
  fat_g numeric(6,1) not null,
  created_at timestamptz not null default now(),
  constraint foods_name_length check (char_length(name) between 1 and 120),
  constraint foods_calories_nonnegative check (calories >= 0),
  constraint foods_protein_nonnegative check (protein_g >= 0),
  constraint foods_carbs_nonnegative check (carbs_g >= 0),
  constraint foods_fat_nonnegative check (fat_g >= 0)
);

create type public.meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');

create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  food_id uuid references public.foods(id) on delete restrict,
  free_text text,
  calories numeric(7,1) not null,
  protein_g numeric(6,1) not null,
  carbs_g numeric(6,1) not null,
  fat_g numeric(6,1) not null,
  quantity numeric(6,2) not null,
  meal_type public.meal_type not null,
  eaten_at timestamptz not null default now(),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint one_food_reference check ((food_id is not null) != (free_text is not null)),
  constraint meal_logs_free_text_length check (free_text is null or char_length(free_text) <= 200),
  constraint meal_logs_calories_nonnegative check (calories >= 0),
  constraint meal_logs_protein_nonnegative check (protein_g >= 0),
  constraint meal_logs_carbs_nonnegative check (carbs_g >= 0),
  constraint meal_logs_fat_nonnegative check (fat_g >= 0),
  constraint meal_logs_quantity_positive check (quantity > 0)
);

create unique index meal_logs_idempotency
  on public.meal_logs(user_id, client_request_id);

create index meal_logs_user_eaten_at
  on public.meal_logs(user_id, eaten_at desc);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'user_' || substr(new.id::text, 1, 8))
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS is explicitly enabled because Phase 0 should default to no table access unless a policy grants it.
alter table public.profiles enable row level security;
alter table public.foods enable row level security;
alter table public.meal_logs enable row level security;

create policy "read own profile"
  on public.profiles
  for select
  using (id = auth.uid());

create policy "update own profile"
  on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "read all foods"
  on public.foods
  for select
  using (true);

create policy "insert own foods"
  on public.foods
  for insert
  with check (created_by = auth.uid());

create policy "update own foods"
  on public.foods
  for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "read own meals"
  on public.meal_logs
  for select
  using (user_id = auth.uid());

create policy "insert own meals"
  on public.meal_logs
  for insert
  with check (user_id = auth.uid());

create policy "update own meals"
  on public.meal_logs
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "delete own meals"
  on public.meal_logs
  for delete
  using (user_id = auth.uid());

comment on constraint profiles_goal_carbs_energy_range on public.profiles is
  'Carb grams are bounded by calorie share so saved goals keep enough energy intake without requiring app code to recalculate validity.';

comment on constraint profiles_goal_unsaturated_fat_min on public.profiles is
  'Unsaturated fat grams are checked against calorie goals so nutrition targets preserve the minimum dietary-fat share at the database boundary.';

comment on column public.meal_logs.calories is
  'Snapshotted at insert time so a food edit cannot retroactively change logged history.';

comment on column public.meal_logs.protein_g is
  'Snapshotted at insert time so a food edit cannot retroactively change logged history.';

comment on column public.meal_logs.carbs_g is
  'Snapshotted at insert time so a food edit cannot retroactively change logged history.';

comment on column public.meal_logs.fat_g is
  'Snapshotted at insert time so a food edit cannot retroactively change logged history.';

comment on index public.meal_logs_idempotency is
  'Client request IDs are unique per user so retrying a meal-log request cannot create duplicate meals.';

comment on function public.handle_new_user() is
  'Profiles are created by the auth trigger so signup has one database-owned path and retried inserts are harmless.';
