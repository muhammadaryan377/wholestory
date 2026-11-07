-- Story invitation expiry and clearer join errors.
--
-- NOT applied automatically. Run once in the Supabase SQL editor (or with `supabase db push`)
-- BEFORE shipping the app version that shows "This invitation has expired".
-- Safe to run more than once.
--
-- What changes:
--   * story_invites gets an expires_at column.
--   * Invitations created from now on expire 30 days after they are created.
--   * Invitations that already exist keep working (their expires_at stays null = no expiry).
--   * join_story() tells "not valid" apart from "has expired" so the app can show the right message.
begin;

alter table public.story_invites add column if not exists expires_at timestamptz;
alter table public.story_invites alter column expires_at set default (now() + interval '30 days');

-- Join a shared story with an invitation code. Requires a signed-in user.
create or replace function public.join_story(invite text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  invite_expires timestamptz;
  story_is_private boolean;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;

  select i.story_id, i.expires_at, s.private
    into sid, invite_expires, story_is_private
    from story_invites i join stories s on s.id = i.story_id
    where i.code = invite;

  -- Unknown code. Private stories also answer "not valid" so their existence is not revealed.
  if sid is null or story_is_private then raise exception 'This invite link is not valid'; end if;
  if invite_expires is not null and invite_expires <= now() then raise exception 'This invite link has expired'; end if;

  insert into story_members(story_id, user_id, role) values (sid, auth.uid(), 'contributor') on conflict do nothing;
  return sid;
end $$;

revoke all on function public.join_story(text) from public;
grant execute on function public.join_story(text) to authenticated;

commit;
