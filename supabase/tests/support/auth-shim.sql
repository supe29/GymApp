-- Local test-only shim replicating the parts of Supabase's managed
-- Postgres environment that the migrations in /supabase/migrations
-- depend on: the `auth.users` table our tables reference by FK, the
-- `auth.uid()` / `auth.role()` helper functions our RLS policies and
-- triggers call, and the `anon` / `authenticated` / `service_role`
-- database roles that PostgREST switches into per-request in a real
-- deployment.
--
-- This file is NOT applied to a real Supabase project (which already
-- provides all of this) — it exists only so this schema's RLS policies
-- and DR-5 triggers can be exercised locally without Docker, using
-- PGlite (see supabase/tests/support/harness.mjs). It intentionally
-- mirrors Supabase's real behavior rather than reinventing it:
-- auth.uid()/auth.role() read the same per-request JWT-claim GUCs that
-- PostgREST sets on a real connection, so a policy that passes here
-- passes for the same reason it would against the real API, and one
-- that fails here fails for the same reason too.

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')::text;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
-- Table/sequence grants for service_role are applied by the harness
-- (bootDatabase) AFTER migrations run, since `grant ... on all tables`
-- only applies to tables that already exist at the time it runs — the
-- public schema is still empty at this point. On real Supabase,
-- service_role's full access is a platform-level default, not something
-- project migrations configure themselves.
