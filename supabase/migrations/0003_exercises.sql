-- Phase 1: Exercise library schema (spec.md §4.1). Content is seeded in
-- Phase 3, not here.

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  instructions text,
  -- Drives SR-3 beginner-safety gating in Phase 5's plan generator.
  difficulty text not null
    check (difficulty in ('beginner', 'intermediate', 'advanced')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger exercises_set_updated_at
  before update on public.exercises
  for each row
  execute function public.set_updated_at();

create table public.exercise_muscles (
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  muscle_group_id uuid not null references public.muscle_groups (id) on delete cascade,
  role text not null check (role in ('primary', 'secondary')),
  primary key (exercise_id, muscle_group_id)
);

comment on table public.exercise_muscles is
  'FR-4.2/FR-4.3: which muscle group(s) an exercise targets, and '
  'whether each is primary or secondary.';

create table public.exercise_equipment (
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  equipment_item_id uuid not null references public.equipment_items (id) on delete cascade,
  primary key (exercise_id, equipment_item_id)
);

comment on table public.exercise_equipment is
  'Equipment required to perform the exercise; drives FR-2.2/SR-6 '
  'equipment filtering in Phase 5.';

alter table public.exercises enable row level security;
alter table public.exercise_muscles enable row level security;
alter table public.exercise_equipment enable row level security;
