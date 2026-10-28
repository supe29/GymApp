-- Phase 1: Workout Session (log), Set Log, Progression Suggestion
-- (spec.md §4.1, FR-5.x, FR-6.x).

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  -- Null for freeform sessions (FR-5.2).
  planned_session_id uuid references public.planned_sessions (id) on delete set null,
  -- Denormalized copy of planned_sessions.workout_plan_id, auto-derived by
  -- a trigger in 0009 so historical attribution (DR-5) never depends on a
  -- join through planned_sessions. Null for freeform sessions.
  workout_plan_id uuid references public.workout_plans (id),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  workout_session_id uuid not null references public.workout_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  set_index smallint not null check (set_index > 0),
  weight_kg numeric(6, 2),
  reps smallint check (reps >= 0),
  rpe numeric(3, 1) check (rpe is null or rpe between 0 and 10),
  logged_at timestamptz not null default now(),
  unique (workout_session_id, exercise_id, set_index)
);

create table public.progression_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  source_workout_session_id uuid not null references public.workout_sessions (id) on delete cascade,
  action text not null check (action in ('increase_weight', 'increase_reps', 'hold')),
  suggested_weight_kg numeric(6, 2),
  suggested_reps smallint,
  rationale text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'overridden')),
  overridden_weight_kg numeric(6, 2),
  overridden_reps smallint,
  created_at timestamptz not null default now()
);

comment on table public.workout_sessions is
  'FR-5.x logged session, plan-attached or freeform.';
comment on table public.set_logs is
  'FR-5.1 per-set log entries within a session.';
comment on table public.progression_suggestions is
  'FR-6.x next-occurrence adjustment suggestion + rationale, produced '
  'by Phase 8. SR-4 (never suggest an increase after a missed set) is '
  'enforced by that phase''s rule engine, not by a DB constraint here.';

alter table public.workout_sessions enable row level security;
alter table public.set_logs enable row level security;
alter table public.progression_suggestions enable row level security;
