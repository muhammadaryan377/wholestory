-- Regression checks for an isolated local PostgreSQL fixture, never production.
do $$ begin
  if current_setting('wholestory.test_database',true) is distinct from 'isolated-fixture' then raise exception 'Run only in an isolated test fixture'; end if;
end $$;
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
insert into profiles(id,name,push_token) values
 ('11111111-1111-4111-8111-111111111111','Owner','private-token'),
 ('22222222-2222-4222-8222-222222222222','Contributor',null);
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
-- Profile updates must work without reading private columns.
insert into profiles(id,name) values (auth.uid(),'Owner') on conflict(id) do nothing;
update profiles set push_token='new-private-token', interests=array['Family'] where id=auth.uid();
do $$ begin
  begin perform push_token from profiles; raise exception 'Push tokens were readable';
  exception when insufficient_privilege then null; end;
end $$;
insert into stories(id,title) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Story');
insert into story_invites(code,story_id) values ('test-invite','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into events(id,name,code) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Event','event-code');
reset role;
insert into storage.objects(bucket_id,name) values ('event-media','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/photo.jpg');
set role anon;
set request.jwt.claim.sub = '';
-- Anonymous guest upload is authorized through a definer helper, not event RLS.
insert into storage.objects(bucket_id,name) values ('event-media','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/guest.jpg');
select guest_add_post('event-code','Guest','guest-token-123456789','Words',array['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/guest.jpg'],null,null,null);
do $$ begin
  if json_array_length(guest_posts('event-code','guest-token-123456789')) <> 1 then raise exception 'Guest post missing'; end if;
  begin perform guest_add_post('event-code','Guest','short','Words',null,null,null,null); raise exception 'Short guest token accepted';
  exception when raise_exception then if sqlerrm='Short guest token accepted' then raise; end if; end;
end $$;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select join_story('test-invite');
insert into entries(id,story_id,text) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Contribution');
update entries set transcript='Edited words' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
insert into entry_photos(entry_id,path) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','stories/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/photo.jpg');
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
delete from entries where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' returning id;
update stories set private=true where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  if exists(select 1 from stories where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'Contributor can read private story'; end if;
  begin perform join_story('test-invite'); raise exception 'Private invite worked';
  exception when raise_exception then if sqlerrm='Private invite worked' then raise; end if; end;
end $$;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
update events set link_expires_at=now()-interval '1 minute' where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set role anon;
set request.jwt.claim.sub = '';
do $$ begin
  if guest_event('event-code') is not null then raise exception 'Expired event is visible'; end if;
  if json_array_length(guest_posts('event-code','guest-token-123456789')) <> 0 then raise exception 'Expired wall posts visible'; end if;
  begin insert into storage.objects(bucket_id,name) values ('event-media','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/expired.jpg'); raise exception 'Expired wall upload accepted';
  exception when insufficient_privilege then null; end;
end $$;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$ begin
  begin perform rotate_event_link('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'); raise exception 'Non-host rotated link';
  exception when raise_exception then if sqlerrm='Non-host rotated link' then raise; end if; end;
end $$;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$ declare code text; begin
  code := rotate_event_link('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  if length(code) <> 20 or guest_event(code) is null then raise exception 'Rotated link is unusable'; end if;
  if guest_event('event-code') is not null then raise exception 'Old link still works'; end if;
end $$;
reset role;
delete from events where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
do $$ begin
  if not exists(select 1 from media_cleanup_queue where bucket='media' and path='stories/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/photo.jpg') then raise exception 'Entry cleanup not queued'; end if;
  if not exists(select 1 from media_cleanup_queue where bucket='event-media' and path='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/guest.jpg') then raise exception 'Event cascade cleanup not queued'; end if;
end $$;
select 'Database regression checks passed' as result;
