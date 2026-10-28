-- Phase 1: DR-5 — plan/target versioning, owned at the schema level.
-- Workout Plan and Nutrition Target rows become immutable once created,
-- except for a single, one-way supersession transition, so that
-- historical Workout Sessions / Set Logs / Food Log Entries always
-- remain attributable to the exact version that was active when they
-- were logged, even after later regenerations.

-- ---------------------------------------------------------------------
-- workout_plans: add version columns.
-- ---------------------------------------------------------------------
alter table public.workout_plans
  add column plan_version integer,
  add column effective_from timestamptz not null default now(),
  add column superseded_at timestamptz;

update public.workout_plans set plan_version = 1 where plan_version is null;

alter table public.workout_plans
  alter column plan_version set not null;

alter table public.workout_plans
  add constraint workout_plans_user_version_unique unique (user_id, plan_version);

-- Auto-assign the next monotonic version per user when not supplied,
-- removing the need for application code to compute it (and the
-- race-window that would introduce). Acceptable for this product's
-- write pattern: a single user regenerating their own plan from one
-- session at a time, not high-concurrency multi-writer inserts.
create or replace function public.assign_next_plan_version()
returns trigger
language plpgsql
as $$
begin
  if new.plan_version is null then
    select coalesce(max(plan_version), 0) + 1
      into new.plan_version
      from public.workout_plans
      where user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger workout_plans_assign_version
  before insert on public.workout_plans
  for each row
  execute function public.assign_next_plan_version();

-- Automatically supersede the previous open version when a new one is
-- inserted, so "regenerating creates a new version and stamps
-- superseded_at on the prior one" (DR-5) is a structural guarantee, not
-- an app-code convention that could be forgotten or done wrong.
create or replace function public.supersede_previous_plan_version()
returns trigger
language plpgsql
as $$
begin
  update public.workout_plans
    set superseded_at = new.effective_from
    where user_id = new.user_id
      and plan_version < new.plan_version
      and superseded_at is null;
  return new;
end;
$$;

create trigger workout_plans_supersede_previous
  after insert on public.workout_plans
  for each row
  execute function public.supersede_previous_plan_version();

-- Immutability: once written, a workout_plans row may never be changed
-- or deleted by a normal user, except the one-time superseded_at
-- transition performed by the trigger above. service_role (the Phase 12
-- account-deletion routine) bypasses this entirely so it can purge data
-- on request (DR-4).
create or replace function public.prevent_version_row_mutation()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception
      '% rows are immutable and cannot be deleted directly; regenerate instead (DR-5)',
      tg_table_name;
  end if;

  if old.superseded_at is not null then
    raise exception
      'this % version has already been superseded and cannot be modified further (DR-5)',
      tg_table_name;
  end if;

  if tg_table_name = 'workout_plans' then
    if new.user_id is distinct from old.user_id
      or new.split_type is distinct from old.split_type
      or new.plan_version is distinct from old.plan_version
      or new.effective_from is distinct from old.effective_from
      or new.created_at is distinct from old.created_at
    then
      raise exception 'workout_plans rows are immutable except for superseded_at (DR-5)';
    end if;
  elsif tg_table_name = 'nutrition_targets' then
    if new.user_id is distinct from old.user_id
      or new.daily_calories is distinct from old.daily_calories
      or new.protein_g is distinct from old.protein_g
      or new.carbs_g is distinct from old.carbs_g
      or new.fat_g is distinct from old.fat_g
      or new.target_version is distinct from old.target_version
      or new.effective_from is distinct from old.effective_from
      or new.created_at is distinct from old.created_at
    then
      raise exception 'nutrition_targets rows are immutable except for superseded_at (DR-5)';
    end if;
  end if;

  return new;
end;
$$;

create trigger workout_plans_immutable
  before update or delete on public.workout_plans
  for each row
  execute function public.prevent_version_row_mutation();

-- ---------------------------------------------------------------------
-- nutrition_targets: identical versioning shape to workout_plans.
-- ---------------------------------------------------------------------
alter table public.nutrition_targets
  add column target_version integer,
  add column effective_from timestamptz not null default now(),
  add column superseded_at timestamptz;

update public.nutrition_targets set target_version = 1 where target_version is null;

alter table public.nutrition_targets
  alter column target_version set not null;

alter table public.nutrition_targets
  add constraint nutrition_targets_user_version_unique unique (user_id, target_version);

create or replace function public.assign_next_target_version()
returns trigger
language plpgsql
as $$
begin
  if new.target_version is null then
    select coalesce(max(target_version), 0) + 1
      into new.target_version
      from public.nutrition_targets
      where user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger nutrition_targets_assign_version
  before insert on public.nutrition_targets
  for each row
  execute function public.assign_next_target_version();

create or replace function public.supersede_previous_target_version()
returns trigger
language plpgsql
as $$
begin
  update public.nutrition_targets
    set superseded_at = new.effective_from
    where user_id = new.user_id
      and target_version < new.target_version
      and superseded_at is null;
  return new;
end;
$$;

create trigger nutrition_targets_supersede_previous
  after insert on public.nutrition_targets
  for each row
  execute function public.supersede_previous_target_version();

create trigger nutrition_targets_immutable
  before update or delete on public.nutrition_targets
  for each row
  execute function public.prevent_version_row_mutation();

-- ---------------------------------------------------------------------
-- Attribution columns: pin historical logs to the exact version that
-- was active when they were created (DR-5).
-- ---------------------------------------------------------------------

-- food_log_entries: which nutrition_targets version produced the daily
-- totals this entry counted against.
alter table public.food_log_entries
  add column nutrition_target_id uuid not null references public.nutrition_targets (id);

-- workout_sessions.workout_plan_id (added in 0005) is auto-derived from
-- planned_session_id so the client never has to pass it explicitly and
-- can never set it inconsistently with the session it attaches to.
create or replace function public.derive_workout_session_plan_id()
returns trigger
language plpgsql
as $$
begin
  if new.planned_session_id is not null and new.workout_plan_id is null then
    select workout_plan_id
      into new.workout_plan_id
      from public.planned_sessions
      where id = new.planned_session_id;
  end if;
  return new;
end;
$$;

create trigger workout_sessions_derive_plan_id
  before insert on public.workout_sessions
  for each row
  execute function public.derive_workout_session_plan_id();

comment on column public.food_log_entries.nutrition_target_id is
  'DR-5: the nutrition_targets version active when this entry was logged. '
  'Never repointed on a later regeneration.';
comment on column public.workout_sessions.workout_plan_id is
  'DR-5: the workout_plans version active when this session was created, '
  'derived from planned_session_id at insert time. Never repointed on a '
  'later regeneration. Null for freeform sessions (FR-5.2).';
