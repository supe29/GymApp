-- Phase 1: Workout Plan / Planned Session schema (spec.md §4.1, FR-2.x).
-- DR-5 versioning columns (plan_version, effective_from, superseded_at)
-- and the immutability trigger are added in
-- 0009_plan_target_versioning.sql, once this base shape exists.

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  split_type text not null
    check (split_type in ('full_body', 'upper_lower', 'push_pull_legs')),
  created_at timestamptz not null default now()
);

create table public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  workout_plan_id uuid not null references public.workout_plans (id) on delete cascade,
  -- Denormalized for straightforward RLS scoping (see 0008). Must always
  -- equal the referenced workout_plans.user_id; enforced by RLS WITH
  -- CHECK clauses rather than a trigger, since these rows are only ever
  -- written once, as part of plan generation.
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  day_order smallint not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (workout_plan_id, day_order)
);

create table public.planned_session_exercises (
  id uuid primary key default gen_random_uuid(),
  planned_session_id uuid not null references public.planned_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  order_index smallint not null,
  target_sets smallint not null check (target_sets > 0),
  target_reps_min smallint not null check (target_reps_min > 0),
  target_reps_max smallint
    check (target_reps_max is null or target_reps_max >= target_reps_min),
  target_weight_kg numeric(6, 2),
  intensity_note text,
  created_at timestamptz not null default now(),
  unique (planned_session_id, order_index)
);

comment on table public.workout_plans is
  'A generated split (spec.md §4.1). Immutable per version once DR-5 '
  'columns are added in 0009.';
comment on table public.planned_sessions is
  'One templated session within a workout plan version, e.g. "Push Day".';
comment on table public.planned_session_exercises is
  'A prescribed exercise within a planned session (FR-2.3).';

alter table public.workout_plans enable row level security;
alter table public.planned_sessions enable row level security;
alter table public.planned_session_exercises enable row level security;
