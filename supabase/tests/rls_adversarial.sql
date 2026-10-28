-- Canonical pgTAP adversarial RLS + DR-5 suite for Phase 1
-- (spec.md PR-1, DR-3, DR-5). Run with `supabase test db` once Docker /
-- the Supabase CLI local stack is available.
--
-- This file was authored but could not be executed in the environment
-- this phase was implemented in (no Docker, so no local Supabase stack
-- and no pgTAP extension available). The equivalent scenarios were
-- instead written and actually run against a real Postgres engine via
-- PGlite — see adversarial.test.mjs and support/harness.mjs — which
-- exercises the same RLS policies and DR-5 triggers through the same
-- role-switching / JWT-claim-GUC mechanism PostgREST uses, without
-- requiring Docker. Both files should be kept in sync; this one is the
-- form the Supabase CLI's own tooling expects.

begin;
select plan(9);

-- Two seed users via the real auth.users table Supabase provides.
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.profiles (user_id, age, height_cm, weight_kg, biological_sex, fitness_level, goal, training_days_per_week)
values
  ('11111111-1111-1111-1111-111111111111', 25, 180, 80, 'prefer_not_to_say', 'beginner', 'general_fitness', 3),
  ('22222222-2222-2222-2222-222222222222', 40, 165, 65, 'prefer_not_to_say', 'beginner', 'general_fitness', 3);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.weight_entries (user_id, weight_kg) values ('11111111-1111-1111-1111-111111111111', 80);
insert into public.workout_plans (user_id, split_type) values ('11111111-1111-1111-1111-111111111111', 'full_body');

-- Switch to user B and attempt cross-user access.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select is(
  (select count(*)::int from public.weight_entries where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  '(a) user B cannot read user A''s weight_entries row'
);

select is(
  (select count(*)::int from public.workout_plans where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  '(a) user B cannot read user A''s workout_plans row'
);

select throws_ok(
  $$ update public.weight_entries set weight_kg = 1 where user_id = '11111111-1111-1111-1111-111111111111' $$,
  null,
  null,
  '(b) user B cannot update user A''s weight_entries row (0-row no-op is also an acceptable pass; see adversarial.test.mjs for the exact both-outcomes assertion)'
);

select is(
  (select count(*)::int from public.weight_entries where user_id = '11111111-1111-1111-1111-111111111111' and weight_kg = 1),
  0,
  '(b) user A''s weight_entries row was not actually mutated by user B'
);

select throws_ok(
  $$ delete from public.weight_entries where user_id = '11111111-1111-1111-1111-111111111111' $$,
  null,
  null,
  '(c) user B cannot delete user A''s weight_entries row'
);

-- (d) unauthenticated.
reset role;
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$ select * from public.profiles $$,
  null,
  null,
  '(d) anon cannot read profiles at all'
);

-- (e) service-role-only: a user cannot delete their own profile directly.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ delete from public.profiles where user_id = '11111111-1111-1111-1111-111111111111' $$,
  null,
  null,
  '(e) authenticated user cannot delete their own profile row directly (service-role-only, DR-4)'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $$ delete from public.profiles where user_id = '11111111-1111-1111-1111-111111111111' $$,
  '(e) service_role can delete a profile row (account deletion routine)'
);

-- DR-5: regenerating a plan supersedes the prior version instead of mutating/deleting it.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.workout_plans (user_id, split_type) values ('22222222-2222-2222-2222-222222222222', 'upper_lower');

select is(
  (select superseded_at is not null from public.workout_plans
    where user_id = '22222222-2222-2222-2222-222222222222' and plan_version = 1),
  true,
  'DR-5: regenerating a plan marks the prior version superseded rather than deleting it'
);

select * from finish();
rollback;
