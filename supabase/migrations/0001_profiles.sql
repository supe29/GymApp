-- Phase 1: User Profile (spec.md §4.1, FR-1.1).
-- Depends on Supabase's built-in auth.users table (managed by GoTrue),
-- which is not created here.

-- gen_random_uuid() is built into Postgres core (13+); no extension needed.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  age smallint not null check (age between 13 and 120),
  height_cm numeric(5, 1) not null check (height_cm > 0),
  weight_kg numeric(5, 1) not null check (weight_kg > 0),
  -- OQ-6 resolved in Phase 2 (see /docs/decisions/OQ-6-biological-sex.md):
  -- three options, not a strict binary and not free text, so the field
  -- doesn't force a disclosure the product doesn't otherwise need while
  -- keeping Phase 6's BMR formula branching a fixed, deterministic set.
  biological_sex text not null
    check (biological_sex in ('male', 'female', 'prefer_not_to_say')),
  fitness_level text not null
    check (fitness_level in ('beginner', 'intermediate', 'advanced')),
  goal text not null
    check (goal in ('fat_loss', 'muscle_gain', 'strength', 'general_fitness')),
  training_days_per_week smallint not null
    check (training_days_per_week between 1 and 7),
  -- Display-only preference. All measurements are stored in SI units
  -- (kg/cm) regardless of this value and converted for display by
  -- packages/core/src/units (see plan.md Phase 6, UX-8).
  unit_preference text not null default 'metric'
    check (unit_preference in ('metric', 'imperial')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per user (spec.md FR-1.1). Equipment list is a separate '
  'many-to-many relation; see 0002_equipment_and_muscle_taxonomy.sql.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

alter table public.profiles enable row level security;
-- Policies for every user-scoped table are added together in
-- 0008_rls_policies.sql, once all tables they reference exist.
