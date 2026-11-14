-- FR-2.5/FR-2.6/DR-6 (resolves OQ-5, see docs/decisions/OQ-5-session-rescheduling.md):
-- the weekdays a user trains on, and their choices for missed sessions.

-- ---------------------------------------------------------------------
-- profiles.training_weekdays: ISO weekdays (1 = Monday ... 7 = Sunday),
-- ascending, one per training day. Plan day N maps to the Nth entry.
-- NULL means not chosen yet. When set, its length must equal
-- training_days_per_week; a profile edit that changes the day count must
-- clear or re-pick it in the same update.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column training_weekdays smallint[]
    check (
      training_weekdays is null
      or (
        array_length(training_weekdays, 1) = training_days_per_week
        and 1 <= all (training_weekdays)
        and 7 >= all (training_weekdays)
      )
    );

comment on column public.profiles.training_weekdays is
  'ISO weekdays (1=Mon..7=Sun) the user trains on; plan day N -> Nth entry. NULL = not chosen.';

-- A profile edit that changes the number of training days invalidates the
-- chosen weekdays. Clear them (the app then asks again) instead of letting
-- the CHECK above reject the whole profile save, unless the same update
-- supplies new weekdays.
create function public.clear_stale_training_weekdays() returns trigger
  language plpgsql as $$
begin
  if new.training_days_per_week is distinct from old.training_days_per_week
     and new.training_weekdays is not distinct from old.training_weekdays then
    new.training_weekdays := null;
  end if;
  return new;
end;
$$;

create trigger profiles_clear_stale_training_weekdays
  before update of training_days_per_week on public.profiles
  for each row execute function public.clear_stale_training_weekdays();

-- ---------------------------------------------------------------------
-- schedule_adjustments: the user's choice for a missed planned session
-- in a given week (skip it, move it to another date, or merge it into a
-- later session). Tied to the plan version it was made against (DR-5):
-- regenerating the plan leaves old adjustments attached to the old
-- version. One choice per session per week; undo deletes the row.
-- ---------------------------------------------------------------------
create table public.schedule_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  workout_plan_id uuid not null references public.workout_plans (id) on delete cascade,
  planned_session_id uuid not null references public.planned_sessions (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  action text not null check (action in ('skip', 'move', 'merge')),
  target_date date,
  merge_into_planned_session_id uuid references public.planned_sessions (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (action <> 'move' or target_date is not null),
  check (action <> 'merge' or merge_into_planned_session_id is not null),
  unique (user_id, workout_plan_id, planned_session_id, week_start)
);

create index schedule_adjustments_user_week_idx
  on public.schedule_adjustments (user_id, workout_plan_id, week_start);

alter table public.schedule_adjustments enable row level security;

-- Owner-only. No update: changing a choice is undo (delete) + choose again.
grant select, insert, delete on public.schedule_adjustments to authenticated;

create policy schedule_adjustments_select_own on public.schedule_adjustments
  for select to authenticated
  using (user_id = auth.uid());

create policy schedule_adjustments_insert_own on public.schedule_adjustments
  for insert to authenticated
  with check (user_id = auth.uid());

create policy schedule_adjustments_delete_own on public.schedule_adjustments
  for delete to authenticated
  using (user_id = auth.uid());
