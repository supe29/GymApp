-- Phase 1: Weight Entry, Personal Record (spec.md §4.1, FR-8.x).

create table public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  weight_kg numeric(5, 1) not null check (weight_kg > 0),
  measured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.personal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  set_log_id uuid not null references public.set_logs (id) on delete cascade,
  -- Both a rep-bucket heaviest-weight fact and an optional estimated 1RM
  -- are stored; which one Phase 10 treats as "the" PR is resolved by
  -- OQ-4, not here.
  rep_count smallint not null check (rep_count > 0),
  weight_kg numeric(6, 2) not null check (weight_kg > 0),
  estimated_one_rm numeric(6, 2),
  achieved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.weight_entries is
  'FR-8.1 body weight log for the trend chart.';
comment on table public.personal_records is
  'FR-8.2 append-only PR history derived from set_logs. "Current PR" is '
  'a query (max per user/exercise/rep_count), not a separate flag, so '
  'full history (spec.md §4.1) is preserved rather than overwritten.';

alter table public.weight_entries enable row level security;
alter table public.personal_records enable row level security;
