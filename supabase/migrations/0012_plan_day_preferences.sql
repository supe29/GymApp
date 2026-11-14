-- FR-2.7: how the user wants their training days split (the weekday-aware
-- recommendation, a named split, or a focus per day with a core toggle),
-- and a 'custom' split type for plans whose days mix focuses.

-- ---------------------------------------------------------------------
-- profiles.plan_preferences: { "split": "auto" | "full_body" |
-- "upper_lower" | "push_pull_legs" | "custom", "days"?: [{ "focus":
-- [...], "core": bool }] }. The detailed shape is validated in
-- packages/core (validPlanPreferences); anything invalid falls back to the
-- recommendation. NULL = recommendation.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column plan_preferences jsonb
    check (
      plan_preferences is null
      or (
        jsonb_typeof(plan_preferences) = 'object'
        and plan_preferences ->> 'split' in ('auto', 'full_body', 'upper_lower', 'push_pull_legs', 'custom')
      )
    );

comment on column public.profiles.plan_preferences is
  'FR-2.7 split preference: auto | named split | custom (with one {focus, core} per training day). NULL = auto.';

-- A change in the number of training days also invalidates custom
-- per-day choices (named splits and auto still apply), extending the
-- weekday-clearing trigger from 0011.
create or replace function public.clear_stale_training_weekdays() returns trigger
  language plpgsql as $$
begin
  if new.training_days_per_week is distinct from old.training_days_per_week then
    if new.training_weekdays is not distinct from old.training_weekdays then
      new.training_weekdays := null;
    end if;
    if new.plan_preferences is not distinct from old.plan_preferences
       and new.plan_preferences ->> 'split' = 'custom' then
      new.plan_preferences := null;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- workout_plans.split_type: allow 'custom' (days that mix focuses).
-- ---------------------------------------------------------------------
alter table public.workout_plans drop constraint workout_plans_split_type_check;
alter table public.workout_plans
  add constraint workout_plans_split_type_check
    check (split_type in ('full_body', 'upper_lower', 'push_pull_legs', 'custom'));
