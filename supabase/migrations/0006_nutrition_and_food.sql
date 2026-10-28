-- Phase 1: Nutrition Target, Food Item, Food Log Entry
-- (spec.md §4.1, FR-3.x, FR-7.x). DR-5 versioning columns for
-- nutrition_targets, and the food_log_entries attribution FK, are added
-- in 0009_plan_target_versioning.sql.

create table public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  daily_calories integer not null check (daily_calories > 0),
  protein_g numeric(6, 1) not null check (protein_g >= 0),
  carbs_g numeric(6, 1) not null check (carbs_g >= 0),
  fat_g numeric(6, 1) not null check (fat_g >= 0),
  created_at timestamptz not null default now()
);

create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  barcode text unique,
  portion_description text not null,
  calories_per_portion numeric(7, 1) not null check (calories_per_portion >= 0),
  protein_g_per_portion numeric(6, 1) not null check (protein_g_per_portion >= 0),
  carbs_g_per_portion numeric(6, 1) not null check (carbs_g_per_portion >= 0),
  fat_g_per_portion numeric(6, 1) not null check (fat_g_per_portion >= 0),
  source text not null check (source in ('external', 'user_created')),
  -- Set only when source = 'user_created' (DR-2/A-7: private per user).
  created_by_user_id uuid references public.profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (source = 'user_created' and created_by_user_id is not null)
    or (source = 'external' and created_by_user_id is null)
  )
);

create table public.food_log_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  food_item_id uuid not null references public.food_items (id),
  meal_slot text not null
    check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  portion_quantity numeric(6, 2) not null check (portion_quantity > 0),
  log_date date not null,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.nutrition_targets is
  'FR-3.x daily calorie/macro targets. Immutable per version once DR-5 '
  'columns are added in 0009.';
comment on table public.food_items is
  'FR-7.x food/product data; external per DR-1/DR-2, or user-created '
  '(private, A-7).';
comment on table public.food_log_entries is
  'FR-7.2 a logged food entry attributed to a user, day, and meal slot. '
  'The DR-5 nutrition_target_id attribution column is added in 0009.';

alter table public.nutrition_targets enable row level security;
alter table public.food_items enable row level security;
alter table public.food_log_entries enable row level security;
