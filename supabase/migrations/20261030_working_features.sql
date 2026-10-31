-- Apply after schema.sql and 20261030_test_build_fixes.sql. Safe to re-run.
begin;

-- Storage policies cannot inspect a table hidden by RLS as an anonymous guest.
create or replace function public.event_upload_allowed(event_folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from events e where e.id::text = event_folder
    and (e.host = auth.uid() or (e.is_open and e.allow_guest_uploads
      and (e.link_expires_at is null or e.link_expires_at > now()))));
$$;
revoke all on function public.event_upload_allowed(text) from public;
grant execute on function public.event_upload_allowed(text) to anon, authenticated;
drop policy if exists "event media: upload when open" on storage.objects;
create policy "event media: upload when open" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'event-media' and public.event_upload_allowed((storage.foldername(name))[1]));

-- Safe parsing prevents other buckets' filenames from being cast to UUID.
create or replace function public.story_file_member(path text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if split_part(path,'/',1) <> 'stories' then return false; end if;
  return public.is_story_member(split_part(path,'/',2)::uuid);
exception when invalid_text_representation then return false;
end $$;
revoke all on function public.story_file_member(text) from public;
grant execute on function public.story_file_member(text) to authenticated;
drop policy if exists "media: members read" on storage.objects;
create policy "media: members read" on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.story_file_member(name));
drop policy if exists "media: members upload" on storage.objects;
create policy "media: members upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.story_file_member(name));

-- Contributors cannot update stories directly. Touch the parent inside the DB.
create or replace function public.touch_story_entry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update stories set updated_at = clock_timestamp() where id = coalesce(new.story_id, old.story_id);
  return coalesce(new,old);
end $$;
drop trigger if exists entries_touch_story on public.entries;
create trigger entries_touch_story after insert or update or delete on public.entries
  for each row execute function public.touch_story_entry();

-- Only transcript editing is exposed; an author cannot move an entry to another story.
revoke update on public.entries from authenticated;
grant update (transcript) on public.entries to authenticated;

create or replace function public.send_push(to_user uuid, title text, body text, data jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  select push_token into tok from profiles where id = to_user;
  if tok is null or tok = '' then return; end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('to', tok, 'title', title, 'body', body, 'data', data, 'sound', 'default'));
exception when others then return; -- Push delivery must never abort a saved story or comment.
end $$;


-- Internal push functions must not be callable from the public API.
revoke execute on function public.send_push(uuid,text,text,jsonb) from public, anon, authenticated;

create or replace function public.guest_event(c text) returns json
language sql security definer set search_path = public stable as $$
  select json_build_object('id',e.id,'name',e.name,'starts_on',e.starts_on,'ends_on',e.ends_on,'place',e.place,'cover_path',e.cover_path,
    'is_open', e.is_open and (e.link_expires_at is null or e.link_expires_at > now()),
    'allow_guest_uploads',e.allow_guest_uploads,'guests_see',e.guests_see,'require_approval',e.require_approval,
    'moments',(select coalesce(json_agg(json_build_object('id',m.id,'name',m.name,'day',m.day,'time_label',m.time_label) order by m.day, m.sort),'[]'::json) from event_moments m where m.event_id = e.id))
  from events e where e.code = c and (e.link_expires_at is null or e.link_expires_at > now());
$$;
create or replace function public.guest_add_post(c text, gname text, gtoken text, body text, photo_paths text[], audio text, dur int, moment uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare ev events; pid uuid; i int := 0; p text;
begin
  select * into ev from events where code = c;
  if ev.id is null then raise exception 'Event not found'; end if;
  if not ev.is_open or not ev.allow_guest_uploads or (ev.link_expires_at is not null and ev.link_expires_at <= now()) then raise exception 'This wall is not taking new photos or stories'; end if;
  if moment is not null and not exists(select 1 from event_moments where id = moment and event_id = ev.id) then moment := null; end if;
  if coalesce(trim(gname),'') = '' then raise exception 'Please add your name'; end if;
  if length(coalesce(gtoken,'')) < 16 then raise exception 'Guest identity is missing; reload the page'; end if;
  if coalesce(trim(body),'') = '' and coalesce(cardinality(photo_paths),0) = 0 and audio is null then raise exception 'Add a photo, story or recording'; end if;
  if audio is not null and (audio not like ev.id::text || '/%' or not exists(select 1 from storage.objects where bucket_id='event-media' and name=audio)) then raise exception 'Invalid recording'; end if;
  if photo_paths is not null and exists(select 1 from unnest(photo_paths) as requested(path) where requested.path not like ev.id::text || '/%' or not exists(select 1 from storage.objects o where o.bucket_id='event-media' and o.name=requested.path)) then raise exception 'Invalid photo'; end if;
  insert into event_posts(event_id,guest_name,guest_token,text,audio_path,duration_ms,approved,moment_id)
    values (ev.id, left(trim(gname),60), gtoken, nullif(trim(body),''), audio, dur, not ev.require_approval, moment) returning id into pid;
  if photo_paths is not null then
    foreach p in array photo_paths loop
      if p like ev.id::text || '/%' then insert into event_post_photos(post_id,path,sort) values (pid,p,i); i := i + 1; end if;
    end loop;
  end if;
  return pid;
end $$;
create or replace function public.guest_posts(c text, gtoken text) returns json
language sql security definer set search_path = public stable as $$
  select coalesce(json_agg(x order by x.created_at desc),'[]'::json) from (
    select p.id, p.guest_name, p.text, p.audio_path, p.duration_ms, p.created_at, p.moment_id, (p.guest_token = gtoken) as mine,
      (select coalesce(json_agg(ph.path order by ph.sort),'[]'::json) from event_post_photos ph where ph.post_id = p.id) as photos,
      (select coalesce(json_agg(json_build_object('id',cm.id,'name',coalesce(cm.guest_name,'Host'),'text',cm.text,'mine',cm.guest_token = gtoken) order by cm.created_at),'[]'::json)
         from comments cm where cm.post_id = p.id) as comments
    from event_posts p join events e on e.id = p.event_id
    where e.code = c and (e.link_expires_at is null or e.link_expires_at > now()) and (p.approved or p.guest_token = gtoken)
      and (e.guests_see = 'all' or p.guest_token = gtoken)
  ) x;
$$;
create or replace function public.guest_add_comment(c text, gname text, gtoken text, pid uuid, body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare ev events; cid uuid;
begin
  select e.* into ev from events e join event_posts p on p.event_id = e.id where e.code = c and p.id = pid and (p.approved or p.guest_token = gtoken);
  if length(coalesce(gtoken,'')) < 16 then raise exception 'Guest identity is missing'; end if;
  if ev.id is null then raise exception 'Not found'; end if;
  if not ev.is_open or (ev.link_expires_at is not null and ev.link_expires_at <= now()) then raise exception 'This wall is closed'; end if;
  if ev.guests_see = 'own' and not exists(select 1 from event_posts where id = pid and guest_token = gtoken) then raise exception 'Not allowed'; end if;
  if coalesce(trim(gname),'') = '' or coalesce(trim(body),'') = '' then raise exception 'Add your name and a comment'; end if;
  insert into comments(post_id, guest_name, guest_token, text) values (pid, left(trim(gname),60), gtoken, left(trim(body),1000)) returning id into cid;
  return cid;
end $$;

-- Delete file bytes via the Storage API, never by deleting storage.objects in SQL.
-- The service-only cleanup-media worker processes this durable queue.
create table if not exists public.media_cleanup_queue (
  id bigint generated always as identity primary key,
  bucket text not null check (bucket in ('media','event-media')),
  path text not null,
  created_at timestamptz not null default now(),
  unique(bucket,path)
);
alter table public.media_cleanup_queue enable row level security;
revoke all on public.media_cleanup_queue from anon, authenticated;
grant all on public.media_cleanup_queue to service_role;
grant usage, select on sequence public.media_cleanup_queue_id_seq to service_role;

create or replace function public.queue_deleted_media() returns trigger
language plpgsql security definer set search_path = public as $$
declare payload jsonb := to_jsonb(old);
begin
  if tg_table_name = 'entry_photos' then
    insert into media_cleanup_queue(bucket,path) values ('media',(payload->>'path')) on conflict do nothing;
  elsif tg_table_name = 'entries' and (payload->>'audio_path') is not null then
    insert into media_cleanup_queue(bucket,path) values ('media',(payload->>'audio_path')) on conflict do nothing;
  elsif tg_table_name = 'event_post_photos' then
    insert into media_cleanup_queue(bucket,path) values ('event-media',(payload->>'path')) on conflict do nothing;
  elsif tg_table_name = 'event_posts' and (payload->>'audio_path') is not null then
    insert into media_cleanup_queue(bucket,path) values ('event-media',(payload->>'audio_path')) on conflict do nothing;
  elsif tg_table_name = 'events' and (payload->>'cover_path') is not null then
    insert into media_cleanup_queue(bucket,path) values ('event-media',(payload->>'cover_path')) on conflict do nothing;
  end if;
  return old;
end $$;
drop trigger if exists entry_photo_cleanup on public.entry_photos;
create trigger entry_photo_cleanup after delete on public.entry_photos for each row execute function public.queue_deleted_media();
drop trigger if exists entry_audio_cleanup on public.entries;
create trigger entry_audio_cleanup after delete on public.entries for each row execute function public.queue_deleted_media();
drop trigger if exists event_photo_cleanup on public.event_post_photos;
create trigger event_photo_cleanup after delete on public.event_post_photos for each row execute function public.queue_deleted_media();
drop trigger if exists event_audio_cleanup on public.event_posts;
create trigger event_audio_cleanup after delete on public.event_posts for each row execute function public.queue_deleted_media();
drop trigger if exists event_cover_cleanup on public.events;
create trigger event_cover_cleanup after delete on public.events for each row execute function public.queue_deleted_media();

-- Rotated/replaced covers also need cleanup.
create or replace function public.queue_replaced_cover() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.cover_path is not null and old.cover_path is distinct from new.cover_path then
    insert into media_cleanup_queue(bucket,path) values ('event-media',old.cover_path) on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists event_cover_replaced on public.events;
create trigger event_cover_replaced after update of cover_path on public.events for each row execute function public.queue_replaced_cover();

-- Rotating an expired invite must produce a usable new link.
create or replace function public.rotate_event_link(event_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare new_code text := left(replace(gen_random_uuid()::text,'-',''),20);
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  update events set code = new_code,
    link_expires_at = case when link_expires_at <= now() then null else link_expires_at end
    where id = event_id and host = auth.uid();
  if not found then raise exception 'Event not found or permission denied'; end if;
  return new_code;
end $$;
revoke all on function public.rotate_event_link(uuid) from public;
grant execute on function public.rotate_event_link(uuid) to authenticated;

commit;
