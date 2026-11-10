-- Minimal stand-ins for the parts of Supabase that join_story() touches, so the function can be tested on a
-- plain, empty PostgreSQL database. This is NOT the real Supabase schema: run it only on a scratch database.
--
--   psql "$SCRATCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/join_story_stubs.sql \
--     -f supabase/migrations/20261107_story_invite_expiry.sql \
--     -f supabase/tests/join_story.test.sql
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
-- Supabase reads the signed-in user from the request's JWT claims; the tests set this value directly.
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,
  title text not null default '',
  private boolean not null default false
);
create table if not exists public.story_members (
  story_id uuid not null references public.stories on delete cascade,
  user_id uuid not null,
  role text not null default 'contributor',
  primary key (story_id, user_id)
);
-- Same shape as supabase/schema.sql (before the expiry migration adds expires_at).
create table if not exists public.story_invites (
  code text primary key default encode(gen_random_bytes(6), 'hex'),
  story_id uuid not null references public.stories on delete cascade,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
