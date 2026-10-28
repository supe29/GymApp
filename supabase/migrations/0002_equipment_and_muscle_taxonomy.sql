-- Phase 1: Equipment Item + Muscle Group taxonomy tables
-- (spec.md §4.1, FR-1.2, A-4). Content (which rows exist) is seeded in
-- Phase 3, not here — this migration only establishes the shape.

create table public.equipment_items (
  id uuid primary key default gen_random_uuid(),
  key text not null unique, -- stable machine-readable id, e.g. 'barbell'
  display_name text not null,
  category text not null
    check (category in ('free_weights', 'machines', 'bodyweight_other')),
  created_at timestamptz not null default now()
);

comment on table public.equipment_items is
  'Shared reference content, not user-scoped. Populated in Phase 3.';

create table public.user_equipment (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  equipment_item_id uuid not null references public.equipment_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, equipment_item_id)
);

comment on table public.user_equipment is
  'A user''s declared available equipment (FR-1.2). Presets (e.g. '
  '"Full gym") are an app-layer convenience that pre-checks rows here; '
  'there is no separate preset table.';

create table public.muscle_groups (
  id uuid primary key default gen_random_uuid(),
  -- Normalized region id shared with the 3D interaction contract
  -- (plan.md Phase 4, packages/three-model/src/muscleRegions.ts).
  key text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

comment on table public.muscle_groups is
  'Fixed, app-defined taxonomy (A-4, resolves OQ-2 in Phase 3). Rows '
  'are seeded in Phase 3; not user-editable.';

alter table public.equipment_items enable row level security;
alter table public.user_equipment enable row level security;
alter table public.muscle_groups enable row level security;
