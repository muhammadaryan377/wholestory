-- Wholestory database for Supabase. Run once in Supabase: SQL editor -> New query -> paste -> Run.
create extension if not exists pgcrypto;

-- People
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles: read own and co-members" on public.profiles for select to authenticated using (true);
create policy "profiles: insert own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles: update own" on public.profiles for update to authenticated using (id = auth.uid());

-- Stories (a story grows through entries: photos, voice, text)
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade default auth.uid(),
  title text not null,
  story_date date not null default current_date,
  hidden_from_memories boolean not null default false,
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.story_members (
  story_id uuid references public.stories on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null default 'contributor' check (role in ('owner','contributor')),
  primary key (story_id, user_id)
);
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories on delete cascade,
  author uuid not null references auth.users on delete cascade default auth.uid(),
  text text,
  audio_path text,
  duration_ms int,
  created_at timestamptz not null default now()
);
create table if not exists public.entry_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries on delete cascade,
  path text not null,
  taken_at timestamptz,
  sort int not null default 0
);
create table if not exists public.story_invites (
  code text primary key default encode(gen_random_bytes(6),'hex'),
  story_id uuid not null references public.stories on delete cascade,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create or replace function public.is_story_member(s uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists(select 1 from story_members where story_id = s and user_id = auth.uid());
$$;

-- the owner becomes a member automatically
create or replace function public.add_owner_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin insert into story_members(story_id,user_id,role) values (new.id,new.owner,'owner') on conflict do nothing; return new; end $$;
drop trigger if exists stories_owner_member on public.stories;
create trigger stories_owner_member after insert on public.stories for each row execute function public.add_owner_member();

alter table public.stories enable row level security;
alter table public.story_members enable row level security;
alter table public.entries enable row level security;
alter table public.entry_photos enable row level security;
alter table public.story_invites enable row level security;

create policy "stories: members read" on public.stories for select to authenticated using (owner = auth.uid() or public.is_story_member(id));
create policy "stories: owner insert" on public.stories for insert to authenticated with check (owner = auth.uid());
create policy "stories: owner update" on public.stories for update to authenticated using (owner = auth.uid());
create policy "stories: owner delete" on public.stories for delete to authenticated using (owner = auth.uid());

create policy "members: read" on public.story_members for select to authenticated using (user_id = auth.uid() or public.is_story_member(story_id));
create policy "members: owner removes" on public.story_members for delete to authenticated
  using (exists(select 1 from stories s where s.id = story_id and s.owner = auth.uid()) or user_id = auth.uid());

create policy "entries: members read" on public.entries for select to authenticated using (public.is_story_member(story_id));
create policy "entries: members add" on public.entries for insert to authenticated with check (author = auth.uid() and public.is_story_member(story_id));
create policy "entries: author or owner deletes" on public.entries for delete to authenticated
  using (author = auth.uid() or exists(select 1 from stories s where s.id = story_id and s.owner = auth.uid()));

create policy "photos: members read" on public.entry_photos for select to authenticated
  using (exists(select 1 from entries e where e.id = entry_id and public.is_story_member(e.story_id)));
create policy "photos: author adds" on public.entry_photos for insert to authenticated
  with check (exists(select 1 from entries e where e.id = entry_id and e.author = auth.uid()));
create policy "photos: author or owner deletes" on public.entry_photos for delete to authenticated
  using (exists(select 1 from entries e join stories s on s.id = e.story_id where e.id = entry_id and (e.author = auth.uid() or s.owner = auth.uid())));

create policy "invites: owner manages" on public.story_invites for all to authenticated
  using (exists(select 1 from stories s where s.id = story_id and s.owner = auth.uid()))
  with check (exists(select 1 from stories s where s.id = story_id and s.owner = auth.uid()));

-- join a shared story with an invite code
create or replace function public.join_story(invite text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select story_id into sid from story_invites where code = invite;
  if sid is null then raise exception 'This invite link is not valid'; end if;
  insert into story_members(story_id,user_id,role) values (sid, auth.uid(), 'contributor') on conflict do nothing;
  return sid;
end $$;
grant execute on function public.join_story(text) to authenticated;

-- Event memory walls
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  host uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null,
  kind text not null default 'Other',
  starts_on date,
  ends_on date,
  place text,
  code text unique not null default encode(gen_random_bytes(5),'hex'),
  is_open boolean not null default true,
  allow_guest_uploads boolean not null default true,
  require_approval boolean not null default false,
  guests_see text not null default 'all' check (guests_see in ('all','own')),
  cover_path text,
  link_expires_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.event_moments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  day int not null default 1,
  time_label text,
  name text not null,
  sort int not null default 0
);
create table if not exists public.event_posts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  author_user uuid references auth.users on delete set null,
  guest_name text,
  guest_token text,
  text text,
  audio_path text,
  duration_ms int,
  moment_id uuid references public.event_moments on delete set null,
  approved boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.event_post_photos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.event_posts on delete cascade,
  path text not null,
  sort int not null default 0
);
-- Comments on story entries and on event wall posts (guests comment through functions below)
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.entries on delete cascade,
  post_id uuid references public.event_posts on delete cascade,
  author_user uuid references auth.users on delete cascade,
  guest_name text,
  guest_token text,
  text text not null check (length(trim(text)) > 0),
  created_at timestamptz not null default now(),
  check ((entry_id is null) <> (post_id is null))
);
alter table public.events enable row level security;
alter table public.event_moments enable row level security;
alter table public.event_posts enable row level security;
alter table public.event_post_photos enable row level security;

create policy "events: host all" on public.events for all to authenticated using (host = auth.uid()) with check (host = auth.uid());
create policy "moments: host all" on public.event_moments for all to authenticated
  using (exists(select 1 from events e where e.id = event_id and e.host = auth.uid()))
  with check (exists(select 1 from events e where e.id = event_id and e.host = auth.uid()));
create policy "posts: host all" on public.event_posts for all to authenticated
  using (exists(select 1 from events e where e.id = event_id and e.host = auth.uid()))
  with check (exists(select 1 from events e where e.id = event_id and e.host = auth.uid()));
create policy "post photos: host all" on public.event_post_photos for all to authenticated
  using (exists(select 1 from event_posts p join events e on e.id = p.event_id where p.id = post_id and e.host = auth.uid()))
  with check (exists(select 1 from event_posts p join events e on e.id = p.event_id where p.id = post_id and e.host = auth.uid()));

-- Guests use the web page without an account. These functions are the only way in.
create or replace function public.guest_event(c text) returns json
language sql security definer set search_path = public stable as $$
  select json_build_object('id',e.id,'name',e.name,'starts_on',e.starts_on,'ends_on',e.ends_on,'place',e.place,'cover_path',e.cover_path,
    'is_open', e.is_open and (e.link_expires_at is null or e.link_expires_at > now()),
    'allow_guest_uploads',e.allow_guest_uploads,'guests_see',e.guests_see,'require_approval',e.require_approval,
    'moments',(select coalesce(json_agg(json_build_object('id',m.id,'name',m.name,'day',m.day,'time_label',m.time_label) order by m.day, m.sort),'[]'::json) from event_moments m where m.event_id = e.id))
  from events e where e.code = c;
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
    where e.code = c and (p.approved or p.guest_token = gtoken)
      and (e.guests_see = 'all' or p.guest_token = gtoken)
  ) x;
$$;
create or replace function public.guest_delete_post(pid uuid, gtoken text) returns void
language sql security definer set search_path = public as $$
  delete from event_posts where id = pid and guest_token = gtoken;
$$;
grant execute on function public.guest_event(text), public.guest_add_post(text,text,text,text,text[],text,int,uuid),
  public.guest_posts(text,text), public.guest_delete_post(uuid,text) to anon, authenticated;

alter table public.comments enable row level security;
create policy "comments: story members read" on public.comments for select to authenticated
  using ((entry_id is not null and exists(select 1 from entries e where e.id = entry_id and public.is_story_member(e.story_id)))
      or (post_id is not null and exists(select 1 from event_posts p join events ev on ev.id = p.event_id where p.id = post_id and ev.host = auth.uid())));
create policy "comments: members and hosts add" on public.comments for insert to authenticated
  with check (author_user = auth.uid() and (
      (entry_id is not null and exists(select 1 from entries e where e.id = entry_id and public.is_story_member(e.story_id)))
   or (post_id is not null and exists(select 1 from event_posts p join events ev on ev.id = p.event_id where p.id = post_id and ev.host = auth.uid()))));
create policy "comments: author, story owner or host deletes" on public.comments for delete to authenticated
  using (author_user = auth.uid()
      or (entry_id is not null and exists(select 1 from entries e join stories s on s.id = e.story_id where e.id = entry_id and s.owner = auth.uid()))
      or (post_id is not null and exists(select 1 from event_posts p join events ev on ev.id = p.event_id where p.id = post_id and ev.host = auth.uid())));

create or replace function public.guest_add_comment(c text, gname text, gtoken text, pid uuid, body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare ev events; cid uuid;
begin
  select e.* into ev from events e join event_posts p on p.event_id = e.id where e.code = c and p.id = pid and (p.approved or p.guest_token = gtoken);
  if ev.id is null then raise exception 'Not found'; end if;
  if not ev.is_open or (ev.link_expires_at is not null and ev.link_expires_at <= now()) then raise exception 'This wall is closed'; end if;
  if ev.guests_see = 'own' and not exists(select 1 from event_posts where id = pid and guest_token = gtoken) then raise exception 'Not allowed'; end if;
  if coalesce(trim(gname),'') = '' or coalesce(trim(body),'') = '' then raise exception 'Add your name and a comment'; end if;
  insert into comments(post_id, guest_name, guest_token, text) values (pid, left(trim(gname),60), gtoken, left(trim(body),1000)) returning id into cid;
  return cid;
end $$;
create or replace function public.guest_delete_comment(cid uuid, gtoken text) returns void
language sql security definer set search_path = public as $$ delete from comments where id = cid and guest_token = gtoken; $$;
grant execute on function public.guest_add_comment(text,text,text,uuid,text), public.guest_delete_comment(uuid,text) to anon, authenticated;

-- Delete my account and everything in it
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin delete from auth.users where id = auth.uid(); end $$;
grant execute on function public.delete_my_account() to authenticated;

-- Storage: private story media, event media readable by link
insert into storage.buckets (id, name, public) values ('media','media',false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('event-media','event-media',true) on conflict do nothing;

-- media/stories/<story_id>/<file>
create policy "media: members read" on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_story_member(((storage.foldername(name))[2])::uuid));
create policy "media: members upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_story_member(((storage.foldername(name))[2])::uuid));
create policy "media: owner of file deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and owner = auth.uid());

-- event-media/<event_id>/<file>: hosts always, guests only while the wall is open
create policy "event media: upload when open" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'event-media' and exists(select 1 from public.events e
    where e.id::text = (storage.foldername(name))[1] and (e.host = auth.uid() or (e.is_open and e.allow_guest_uploads))));
create policy "event media: host deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'event-media' and exists(select 1 from public.events e where e.id::text = (storage.foldername(name))[1] and e.host = auth.uid()));

-- ===================== Version 2 additions =====================
-- Private albums, speech-to-text, photo places for the map, People Pages, notifications.
alter table public.stories add column if not exists private boolean not null default false;
alter table public.entries add column if not exists transcript text;
alter table public.entry_photos add column if not exists lat double precision;
alter table public.entry_photos add column if not exists lng double precision;
alter table public.profiles add column if not exists push_token text;

-- People Pages: people you name yourself, and which stories they are in
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null,
  relation text,
  created_at timestamptz not null default now()
);
create table if not exists public.story_people (
  story_id uuid references public.stories on delete cascade,
  person_id uuid references public.people on delete cascade,
  primary key (story_id, person_id)
);
alter table public.people enable row level security;
alter table public.story_people enable row level security;
create policy "people: owner all" on public.people for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "story people: owner all" on public.story_people for all to authenticated
  using (exists(select 1 from people p where p.id = person_id and p.owner = auth.uid()))
  with check (exists(select 1 from people p where p.id = person_id and p.owner = auth.uid())
              and exists(select 1 from stories s where s.id = story_id and (s.owner = auth.uid() or public.is_story_member(s.id))));

-- Notifications from other people: "Alex added to your story", "3 guests added to your wall"
-- Uses Supabase's pg_net extension to call the Expo push service.
create extension if not exists pg_net;
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
end $$;

create or replace function public.notify_story_entry() returns trigger
language plpgsql security definer set search_path = public as $$
declare s stories; who text;
begin
  select * into s from stories where id = new.story_id;
  if s.owner is null or s.owner = new.author then return new; end if;
  select coalesce(nullif(name,''),'Someone') into who from profiles where id = new.author;
  perform send_push(s.owner, s.title, coalesce(who,'Someone') || ' added to your story', jsonb_build_object('url','/story/' || s.id));
  return new;
end $$;
drop trigger if exists entries_notify on public.entries;
create trigger entries_notify after insert on public.entries for each row execute function public.notify_story_entry();

create or replace function public.notify_event_post() returns trigger
language plpgsql security definer set search_path = public as $$
declare ev events;
begin
  if new.author_user is not null then return new; end if;
  select * into ev from events where id = new.event_id;
  perform send_push(ev.host, ev.name,
    coalesce(new.guest_name,'A guest') || case when new.approved then ' added to your wall' else ' sent something for you to approve' end,
    jsonb_build_object('url','/event/' || ev.id));
  return new;
end $$;
drop trigger if exists event_posts_notify on public.event_posts;
create trigger event_posts_notify after insert on public.event_posts for each row execute function public.notify_event_post();

-- ===================== Version 3 additions =====================
-- Photo captions (Tell the whole story), favourites, hard memories for people and dates, sign-up choices.
alter table public.entry_photos add column if not exists caption text;
alter table public.people add column if not exists hidden_from_memories boolean not null default false;
alter table public.profiles add column if not exists interests text[] not null default '{}';
alter table public.profiles add column if not exists morning_memory boolean not null default true;

create table if not exists public.favourites (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  photo_id uuid not null references public.entry_photos on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, photo_id)
);
alter table public.favourites enable row level security;
create policy "favourites: own" on public.favourites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.skip_dates (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade default auth.uid(),
  month int not null check (month between 1 and 12),
  day int not null check (day between 1 and 31),
  label text
);
alter table public.skip_dates enable row level security;
create policy "skip dates: own" on public.skip_dates for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- Event cover photos live in event-media/<event_id>/cover-*.jpg and are uploaded by the host (policy above).

-- Notify story owners and hosts about new comments
create or replace function public.notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare s stories; ev events; who text;
begin
  if new.entry_id is not null then
    select st.* into s from stories st join entries e on e.story_id = st.id where e.id = new.entry_id;
    if s.owner is not null and s.owner is distinct from new.author_user then
      select coalesce(nullif(name,''),'Someone') into who from profiles where id = new.author_user;
      perform send_push(s.owner, s.title, coalesce(who,'Someone') || ' commented: ' || left(new.text, 80), jsonb_build_object('url','/story/' || s.id));
    end if;
  elsif new.guest_name is not null then
    select e.* into ev from events e join event_posts p on p.event_id = e.id where p.id = new.post_id;
    perform send_push(ev.host, ev.name, new.guest_name || ' commented: ' || left(new.text, 80), jsonb_build_object('url','/event/' || ev.id));
  end if;
  return new;
end $$;
drop trigger if exists comments_notify on public.comments;
create trigger comments_notify after insert on public.comments for each row execute function public.notify_comment();
