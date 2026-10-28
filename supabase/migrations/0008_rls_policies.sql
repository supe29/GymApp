-- Phase 1: Row Level Security policies for every table created in
-- 0001-0007 (PR-1, DR-3). No policy is ever granted `to anon`, so
-- unauthenticated requests are rejected by default (no matching policy =
-- deny under RLS) in addition to auth.uid() being NULL for anon anyway.
--
-- `authenticated` also has no table-level GRANT unless listed explicitly
-- below, so both the coarse (table-privilege) and fine (row-policy) layers
-- have to agree before any access is allowed.

-- ---------------------------------------------------------------------
-- profiles: owner-only. No delete policy for authenticated at all —
-- account deletion is a service-role-only operation performed by the
-- Phase 12 delete-account routine (via the auth admin API), not a
-- direct row delete by the user. This is the deliberate
-- "service-role-only operation" case Phase 1's adversarial tests target.
-- ---------------------------------------------------------------------
grant select, insert, update on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = auth.uid());

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (user_id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- user_equipment: owner-only, full CRUD (editing the equipment list).
-- ---------------------------------------------------------------------
grant select, insert, delete on public.user_equipment to authenticated;

create policy user_equipment_select_own on public.user_equipment
  for select to authenticated
  using (user_id = auth.uid());

create policy user_equipment_insert_own on public.user_equipment
  for insert to authenticated
  with check (user_id = auth.uid());

create policy user_equipment_delete_own on public.user_equipment
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Shared reference content: equipment_items, muscle_groups, exercises,
-- exercise_muscles, exercise_equipment. Readable by any authenticated
-- user; never writable by authenticated/anon (content is managed by the
-- Phase 3 seed/tagging pipeline running with elevated privileges).
-- ---------------------------------------------------------------------
grant select on public.equipment_items to authenticated;
grant select on public.muscle_groups to authenticated;
grant select on public.exercises to authenticated;
grant select on public.exercise_muscles to authenticated;
grant select on public.exercise_equipment to authenticated;

create policy equipment_items_select_authenticated on public.equipment_items
  for select to authenticated
  using (true);

create policy muscle_groups_select_authenticated on public.muscle_groups
  for select to authenticated
  using (true);

create policy exercises_select_authenticated on public.exercises
  for select to authenticated
  using (true);

create policy exercise_muscles_select_authenticated on public.exercise_muscles
  for select to authenticated
  using (true);

create policy exercise_equipment_select_authenticated on public.exercise_equipment
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- workout_plans: owner-only select/insert/update. No delete policy for
-- authenticated (DR-5: a version must never be removable by the user,
-- only ever superseded) — service-role-only, the second deliberate
-- "service-role-only operation" case for the adversarial tests.
-- UPDATE is further restricted to the superseded_at transition by the
-- immutability trigger added in 0009; RLS alone only checks ownership.
-- ---------------------------------------------------------------------
grant select, insert, update on public.workout_plans to authenticated;

create policy workout_plans_select_own on public.workout_plans
  for select to authenticated
  using (user_id = auth.uid());

create policy workout_plans_insert_own on public.workout_plans
  for insert to authenticated
  with check (user_id = auth.uid());

create policy workout_plans_update_own on public.workout_plans
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- planned_sessions / planned_session_exercises: owner-only select/insert
-- only. These rows are part of an immutable plan version and are never
-- updated or deleted by the user once written; service-role-only.
-- ---------------------------------------------------------------------
grant select, insert on public.planned_sessions to authenticated;
grant select, insert on public.planned_session_exercises to authenticated;

create policy planned_sessions_select_own on public.planned_sessions
  for select to authenticated
  using (user_id = auth.uid());

create policy planned_sessions_insert_own on public.planned_sessions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and workout_plan_id in (select id from public.workout_plans where user_id = auth.uid())
  );

create policy planned_session_exercises_select_own on public.planned_session_exercises
  for select to authenticated
  using (user_id = auth.uid());

create policy planned_session_exercises_insert_own on public.planned_session_exercises
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and planned_session_id in (select id from public.planned_sessions where user_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- workout_sessions / set_logs: owner-only, full CRUD (logging is
-- expected to be edited/corrected/discarded by the user).
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.workout_sessions to authenticated;
grant select, insert, update, delete on public.set_logs to authenticated;

create policy workout_sessions_select_own on public.workout_sessions
  for select to authenticated
  using (user_id = auth.uid());

create policy workout_sessions_insert_own on public.workout_sessions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy workout_sessions_update_own on public.workout_sessions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy workout_sessions_delete_own on public.workout_sessions
  for delete to authenticated
  using (user_id = auth.uid());

create policy set_logs_select_own on public.set_logs
  for select to authenticated
  using (user_id = auth.uid());

create policy set_logs_insert_own on public.set_logs
  for insert to authenticated
  with check (user_id = auth.uid());

create policy set_logs_update_own on public.set_logs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy set_logs_delete_own on public.set_logs
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- progression_suggestions: owner-only select/insert/update (accept /
-- decline / override, FR-6.2). No delete — suggestion history is kept.
-- ---------------------------------------------------------------------
grant select, insert, update on public.progression_suggestions to authenticated;

create policy progression_suggestions_select_own on public.progression_suggestions
  for select to authenticated
  using (user_id = auth.uid());

create policy progression_suggestions_insert_own on public.progression_suggestions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy progression_suggestions_update_own on public.progression_suggestions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- nutrition_targets: same shape as workout_plans (DR-5) — owner-only
-- select/insert/update, no delete for authenticated.
-- ---------------------------------------------------------------------
grant select, insert, update on public.nutrition_targets to authenticated;

create policy nutrition_targets_select_own on public.nutrition_targets
  for select to authenticated
  using (user_id = auth.uid());

create policy nutrition_targets_insert_own on public.nutrition_targets
  for insert to authenticated
  with check (user_id = auth.uid());

create policy nutrition_targets_update_own on public.nutrition_targets
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- food_items: external rows are readable by everyone authenticated;
-- user-created rows are private to their creator (DR-2/A-7). Only the
-- creator may write/modify/delete their own custom rows; external rows
-- are never writable by authenticated users at all.
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.food_items to authenticated;

create policy food_items_select_visible on public.food_items
  for select to authenticated
  using (source = 'external' or created_by_user_id = auth.uid());

create policy food_items_insert_own_custom on public.food_items
  for insert to authenticated
  with check (source = 'user_created' and created_by_user_id = auth.uid());

create policy food_items_update_own_custom on public.food_items
  for update to authenticated
  using (source = 'user_created' and created_by_user_id = auth.uid())
  with check (source = 'user_created' and created_by_user_id = auth.uid());

create policy food_items_delete_own_custom on public.food_items
  for delete to authenticated
  using (source = 'user_created' and created_by_user_id = auth.uid());

-- ---------------------------------------------------------------------
-- food_log_entries / weight_entries: owner-only, full CRUD.
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.food_log_entries to authenticated;
grant select, insert, update, delete on public.weight_entries to authenticated;

create policy food_log_entries_select_own on public.food_log_entries
  for select to authenticated
  using (user_id = auth.uid());

create policy food_log_entries_insert_own on public.food_log_entries
  for insert to authenticated
  with check (user_id = auth.uid());

create policy food_log_entries_update_own on public.food_log_entries
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy food_log_entries_delete_own on public.food_log_entries
  for delete to authenticated
  using (user_id = auth.uid());

create policy weight_entries_select_own on public.weight_entries
  for select to authenticated
  using (user_id = auth.uid());

create policy weight_entries_insert_own on public.weight_entries
  for insert to authenticated
  with check (user_id = auth.uid());

create policy weight_entries_update_own on public.weight_entries
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy weight_entries_delete_own on public.weight_entries
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- personal_records: owner-only select/insert. No update/delete for
-- authenticated — append-only history (see 0007 comment); service-role
-- only, for the Phase 12 account-deletion cascade.
-- ---------------------------------------------------------------------
grant select, insert on public.personal_records to authenticated;

create policy personal_records_select_own on public.personal_records
  for select to authenticated
  using (user_id = auth.uid());

create policy personal_records_insert_own on public.personal_records
  for insert to authenticated
  with check (user_id = auth.uid());
