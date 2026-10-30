-- Run once against the existing project, after schema.sql. Safe to re-run.
begin;

-- A private album must stop existing contributors from reading the story.
create or replace function public.is_story_member(s uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from story_members m join stories st on st.id = m.story_id
    where m.story_id = s and m.user_id = auth.uid()
      and (st.owner = auth.uid() or not st.private)
  );
$$;

create or replace function public.can_read_profile(target uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select target = auth.uid() or exists (
    select 1 from story_members a join story_members b on b.story_id = a.story_id
    where a.user_id = auth.uid() and b.user_id = target
      and public.is_story_member(a.story_id)
  );
$$;
revoke all on function public.can_read_profile(uuid) from public;
grant execute on function public.can_read_profile(uuid) to authenticated;
drop policy if exists "profiles: read own and co-members" on public.profiles;
create policy "profiles: read own and co-members" on public.profiles
  for select to authenticated using (public.can_read_profile(id));
-- Push tokens and personal preferences must not be exposed to co-members.
revoke select on public.profiles from anon, authenticated;
grant select (id, name, created_at) on public.profiles to authenticated;

drop policy if exists "entries: author updates" on public.entries;
create policy "entries: author updates" on public.entries for update to authenticated
  using (author = auth.uid() and public.is_story_member(story_id))
  with check (author = auth.uid() and public.is_story_member(story_id));

-- Private stories cannot be joined using a previously shared invite.
create or replace function public.join_story(invite text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select i.story_id into sid from story_invites i join stories s on s.id = i.story_id
    where i.code = invite and not s.private;
  if sid is null then raise exception 'This invite link is not valid'; end if;
  insert into story_members(story_id,user_id,role) values (sid, auth.uid(), 'contributor') on conflict do nothing;
  return sid;
end $$;
revoke all on function public.join_story(text) from public;
grant execute on function public.join_story(text) to authenticated;

commit;
