-- Behavioural tests for 20261110_onboarding_progress.sql. See onboarding_stubs.sql for how to run them.
-- Any failed check raises an exception and stops psql with a non-zero exit code.
\set ON_ERROR_STOP on

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', what; end if;
end $$;

-- Existing accounts are finished; accounts with no evidence and guests are not.
select pg_temp.check((select count(*) = 5 from public.user_onboarding where completed_at is not null), 'five existing accounts backfilled');
select pg_temp.check(not exists (select 1 from public.user_onboarding where user_id in ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000007')), 'unused and guest accounts are not backfilled');
select pg_temp.check((select public from storage.buckets where id = 'avatars') = false, 'avatars bucket is private');

-- A person reads and writes only their own progress.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000006';
insert into public.user_onboarding (user_id, current_step) values ('00000000-0000-4000-8000-000000000006', 'photos')
  on conflict (user_id) do update set current_step = excluded.current_step;
select pg_temp.check((select count(*) = 1 from public.user_onboarding), 'only own row is visible');
select pg_temp.check((select current_step = 'photos' from public.user_onboarding), 'progress is saved');
update public.user_onboarding set completed_at = now() where user_id = '00000000-0000-4000-8000-000000000001';
reset role;
select pg_temp.check((select current_step = 'plan' from public.user_onboarding where user_id = '00000000-0000-4000-8000-000000000001'), 'others are untouched');

set role authenticated;
do $$ begin
  insert into public.user_onboarding (user_id) values ('00000000-0000-4000-8000-000000000003');
  raise exception 'FAILED: inserted a row for another person';
exception when insufficient_privilege then null;
end $$;

-- Moving between steps never clears a finished account.
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
insert into public.user_onboarding (user_id, current_step) values ('00000000-0000-4000-8000-000000000003', 'profile')
  on conflict (user_id) do update set current_step = excluded.current_step;
select pg_temp.check((select completed_at is not null from public.user_onboarding), 'finished stays finished');

-- Private setup choices come back only through the function, and only for the caller.
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
select pg_temp.check((select public.my_profile_setup()->'interests' = '["Family"]'::jsonb), 'own choices are readable');
do $$ begin
  perform interests from public.profiles;
  raise exception 'FAILED: interests readable directly';
exception when insufficient_privilege then null;
end $$;

-- A profile may only point at a file in its owner's folder.
update public.profiles set avatar_path = '00000000-0000-4000-8000-000000000002/a.jpg' where id = '00000000-0000-4000-8000-000000000002';
do $$ begin
  update public.profiles set avatar_path = '00000000-0000-4000-8000-000000000003/victim.jpg' where id = '00000000-0000-4000-8000-000000000002';
  raise exception 'FAILED: accepted a path in another folder';
exception when check_violation then null;
end $$;

-- Storage access is limited to the owner's folder.
insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-4000-8000-000000000002/a.jpg');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-4000-8000-000000000003/x.jpg');
  raise exception 'FAILED: uploaded into another folder';
exception when insufficient_privilege then null;
end $$;

-- Replacing a photo and deleting an account queue the old file for removal.
update public.profiles set avatar_path = '00000000-0000-4000-8000-000000000002/b.jpg' where id = '00000000-0000-4000-8000-000000000002';
reset role;
select pg_temp.check((select count(*) = 1 from public.media_cleanup_queue where bucket = 'avatars' and path like '%/a.jpg'), 'replaced photo queued');
delete from auth.users where id = '00000000-0000-4000-8000-000000000002';
select pg_temp.check((select count(*) = 1 from public.media_cleanup_queue where bucket = 'avatars' and path like '%/b.jpg'), 'deleted account photo queued');
select pg_temp.check(not exists (select 1 from public.user_onboarding where user_id = '00000000-0000-4000-8000-000000000002'), 'progress removed with the account');

select 'onboarding migration checks passed' as result;
