-- Behavioural tests for public.join_story() after 20261107_story_invite_expiry.sql.
-- Run on a scratch database after join_story_stubs.sql and the migration (see the header of that file).
-- Any failed check raises an exception and stops psql with a non-zero exit code.
\set ON_ERROR_STOP on

-- Helper: run a statement that must fail with a message containing `expected`.
create function pg_temp.expect_error(stmt text, expected text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAILED: expected an error containing "%" but the statement succeeded: %', expected, stmt;
exception when others then
  if sqlerrm like 'FAILED:%' then raise; end if;
  if position(expected in sqlerrm) = 0 then
    raise exception 'FAILED: expected "%" but got "%" for: %', expected, sqlerrm, stmt;
  end if;
end $$;

create function pg_temp.sign_in(uid text) returns void language sql as
$$ select set_config('request.jwt.claim.sub', uid, false) $$;

insert into auth.users(id) values
  ('00000000-0000-4000-8000-0000000000a1'),   -- story owner
  ('00000000-0000-4000-8000-0000000000b2'),   -- person who joins
  ('00000000-0000-4000-8000-0000000000c3'),   -- another person
  ('00000000-0000-4000-8000-0000000000d4');   -- another person

insert into public.stories(id, owner, title, private) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'Public story', false),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', 'Private story', true);

insert into public.story_invites(code, story_id, created_by, expires_at) values
  ('validcode001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', now() + interval '5 days'),
  ('expiredcode1', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', now() - interval '1 second'),
  ('oldinvite001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', null),
  ('privatecode1', '10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', null);

-- 1. SUCCESS: a signed-in person with a valid invitation joins the right story, and joining twice is harmless.
select pg_temp.sign_in('00000000-0000-4000-8000-0000000000b2');
do $$ begin
  if public.join_story('validcode001') <> '10000000-0000-4000-8000-000000000001' then raise exception 'FAILED: wrong story returned'; end if;
  if public.join_story('validcode001') <> '10000000-0000-4000-8000-000000000001' then raise exception 'FAILED: joining twice must work'; end if;
  if (select count(*) from public.story_members where story_id = '10000000-0000-4000-8000-000000000001'
        and user_id = '00000000-0000-4000-8000-0000000000b2' and role = 'contributor') <> 1 then
    raise exception 'FAILED: expected exactly one contributor membership';
  end if;
end $$;

-- 2. INVALID: an unknown code is rejected and nobody is added.
select pg_temp.sign_in('00000000-0000-4000-8000-0000000000c3');
select pg_temp.expect_error($$select public.join_story('doesnotexist1')$$, 'This invite link is not valid');
select pg_temp.expect_error($$select public.join_story('')$$, 'This invite link is not valid');

-- 3. EXPIRED: an expired code says so and nobody is added.
select pg_temp.expect_error($$select public.join_story('expiredcode1')$$, 'This invite link has expired');
do $$ begin
  if exists (select 1 from public.story_members where user_id = '00000000-0000-4000-8000-0000000000c3') then
    raise exception 'FAILED: a rejected invitation must not add a member';
  end if;
end $$;

-- 4. Invitations created before the migration (no expiry) keep working.
do $$ begin
  if public.join_story('oldinvite001') <> '10000000-0000-4000-8000-000000000001' then raise exception 'FAILED: old invitation without expiry'; end if;
end $$;

-- 5. PRIVATE stories cannot be joined, and the answer does not reveal that the story exists.
select pg_temp.sign_in('00000000-0000-4000-8000-0000000000d4');
select pg_temp.expect_error($$select public.join_story('privatecode1')$$, 'This invite link is not valid');
do $$ begin
  if exists (select 1 from public.story_members where user_id = '00000000-0000-4000-8000-0000000000d4') then
    raise exception 'FAILED: nobody may join a private story with an invitation';
  end if;
end $$;

-- 6. SIGNED OUT: no user means no join.
select pg_temp.sign_in('');
select pg_temp.expect_error($$select public.join_story('validcode001')$$, 'Please sign in first');

-- 7. New invitations expire about 30 days after they are created.
select pg_temp.sign_in('00000000-0000-4000-8000-0000000000a1');
do $$ declare c text; e timestamptz; begin
  insert into public.story_invites(story_id) values ('10000000-0000-4000-8000-000000000001') returning code, expires_at into c, e;
  if e is null or e < now() + interval '29 days' or e > now() + interval '31 days' then
    raise exception 'FAILED: new invitation expiry should be about 30 days, got %', e;
  end if;
end $$;

-- 8. Only signed-in users may call the function at all.
do $$ begin
  if has_function_privilege('anon', 'public.join_story(text)', 'execute') then raise exception 'FAILED: anon must not execute join_story'; end if;
  if not has_function_privilege('authenticated', 'public.join_story(text)', 'execute') then raise exception 'FAILED: authenticated must execute join_story'; end if;
end $$;

select 'join_story: all checks passed' as result;
