-- Minimal stand-ins for the parts of Supabase that the onboarding migration touches, so it can be tested on a
-- plain, empty PostgreSQL database. This is NOT the real Supabase schema: run it only on a scratch database.
--
--   psql "$SCRATCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/onboarding_stubs.sql \
--     -f supabase/migrations/20261110_onboarding_progress.sql \
--     -f supabase/migrations/20261110_onboarding_progress.sql \
--     -f supabase/tests/onboarding.test.sql
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema auth;
create table auth.users (id uuid primary key, is_anonymous boolean not null default false, raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
create function storage.foldername(name text) returns text[] language sql immutable as
$$ select (string_to_array(name, '/'))[1:cardinality(string_to_array(name, '/')) - 1] $$;
alter table storage.objects enable row level security;
grant usage on schema storage, auth to authenticated;
grant select, insert, delete on storage.objects to authenticated;

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  interests text[] not null default '{}',
  morning_memory boolean not null default true
);
grant usage on schema public to authenticated;
grant select (id, name) on public.profiles to authenticated;
grant update on public.profiles to authenticated;
create table public.stories (id uuid primary key default gen_random_uuid(), owner uuid not null);
create table public.story_members (story_id uuid not null, user_id uuid not null);
create table public.events (id uuid primary key default gen_random_uuid(), host uuid not null);
create table public.media_cleanup_queue (
  id bigint generated always as identity primary key,
  bucket text not null check (bucket in ('media','event-media')),
  path text not null,
  unique (bucket, path)
);

-- Accounts as they exist before the migration.
insert into auth.users (id, is_anonymous, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', false, '{"setup_complete": true}'),
  ('00000000-0000-4000-8000-000000000002', false, '{}'),
  ('00000000-0000-4000-8000-000000000003', false, '{}'),
  ('00000000-0000-4000-8000-000000000004', false, '{}'),
  ('00000000-0000-4000-8000-000000000005', false, '{}'),
  ('00000000-0000-4000-8000-000000000006', false, '{}'),
  ('00000000-0000-4000-8000-000000000007', true, '{"setup_complete": true}');
insert into public.profiles (id, name, interests) values
  ('00000000-0000-4000-8000-000000000002', 'Interests only', '{Family}'),
  ('00000000-0000-4000-8000-000000000006', 'Never finished', '{}');
insert into public.stories (owner) values ('00000000-0000-4000-8000-000000000003');
insert into public.story_members (story_id, user_id) values (gen_random_uuid(), '00000000-0000-4000-8000-000000000004');
insert into public.events (host) values ('00000000-0000-4000-8000-000000000005');
