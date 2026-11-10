-- Per-account onboarding progress and account-backed profile photos.
--
-- NOT applied automatically. Run once in the Supabase SQL editor (or with `supabase db push`)
-- BEFORE shipping the app version that reads user_onboarding. Safe to run more than once.
--
-- What changes:
--   * user_onboarding records each account's current setup step and when setup finished.
--   * Accounts that already used the app are marked finished, so they are not sent through setup again.
--   * profiles gets avatar_path, and a private "avatars" bucket holds each person's own photo.
--   * my_profile_setup() lets a person read back their own private setup choices.
-- No existing row or file is deleted or overwritten.
begin;

create table if not exists public.user_onboarding (
  user_id uuid primary key references auth.users on delete cascade,
  current_step text not null default 'profile' check (current_step in ('profile','photos','moments','plan')),
  completed_at timestamptz
);
alter table public.user_onboarding enable row level security;
revoke all on public.user_onboarding from anon;
grant select, insert, update on public.user_onboarding to authenticated;
drop policy if exists "user_onboarding: read own" on public.user_onboarding;
create policy "user_onboarding: read own" on public.user_onboarding
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "user_onboarding: insert own" on public.user_onboarding;
create policy "user_onboarding: insert own" on public.user_onboarding
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "user_onboarding: update own" on public.user_onboarding;
create policy "user_onboarding: update own" on public.user_onboarding
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Anyone with evidence of having finished setup or used the app counts as an existing user.
insert into public.user_onboarding (user_id, current_step, completed_at)
select u.id, 'plan', now()
from auth.users u
where coalesce(u.is_anonymous, false) = false
  and (
    u.raw_user_meta_data->>'setup_complete' = 'true'
    or exists (select 1 from public.profiles p where p.id = u.id and cardinality(p.interests) > 0)
    or exists (select 1 from public.stories s where s.owner = u.id)
    or exists (select 1 from public.story_members m where m.user_id = u.id)
    or exists (select 1 from public.events e where e.host = u.id)
  )
on conflict (user_id) do update
  set completed_at = coalesce(public.user_onboarding.completed_at, excluded.completed_at);

alter table public.profiles add column if not exists avatar_path text;
-- The cleanup worker deletes the paths recorded here, so a path may only ever point at the person's own folder.
alter table public.profiles drop constraint if exists profiles_avatar_path_own_folder;
alter table public.profiles add constraint profiles_avatar_path_own_folder
  check (avatar_path is null or avatar_path like id::text || '/%');

-- profiles columns other than id, name and created_at are deliberately hidden from co-members.
create or replace function public.my_profile_setup() returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object('interests', p.interests, 'morning_memory', p.morning_memory, 'avatar_path', p.avatar_path)
  from profiles p where p.id = auth.uid();
$$;
revoke all on function public.my_profile_setup() from public;
grant execute on function public.my_profile_setup() to authenticated;

-- avatars/<user_id>/<file>: private to its owner.
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false) on conflict do nothing;
drop policy if exists "avatars: owner reads" on storage.objects;
create policy "avatars: owner reads" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars: owner uploads" on storage.objects;
create policy "avatars: owner uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars: owner deletes" on storage.objects;
create policy "avatars: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Replaced photos and deleted accounts go through the existing durable cleanup queue.
alter table public.media_cleanup_queue drop constraint if exists media_cleanup_queue_bucket_check;
alter table public.media_cleanup_queue add constraint media_cleanup_queue_bucket_check
  check (bucket in ('media','event-media','avatars'));

create or replace function public.queue_replaced_avatar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.avatar_path is not null and (tg_op = 'DELETE' or new.avatar_path is distinct from old.avatar_path) then
    insert into media_cleanup_queue(bucket, path) values ('avatars', old.avatar_path) on conflict do nothing;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists profile_avatar_cleanup on public.profiles;
create trigger profile_avatar_cleanup after update of avatar_path or delete on public.profiles
  for each row execute function public.queue_replaced_avatar();

commit;
