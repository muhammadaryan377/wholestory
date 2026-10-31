import { parseDate } from '@/lib/dates';
import { supabase } from './supabase';
import { uploadFile } from './media';
import { privateIsUnlocked, PrivateLockedError } from './private-access';

export type Story = { id: string; owner: string; title: string; story_date: string; hidden_from_memories: boolean; closed: boolean; private: boolean; created_at: string; updated_at: string; cover?: string | null; entryCount?: number; lat?: number | null; lng?: number | null; peopleIds?: string[]; searchText?: string };
export type Entry = { id: string; story_id: string; author: string; text: string | null; transcript: string | null; audio_path: string | null; duration_ms: number | null; created_at: string; photos: StoredPhoto[]; author_name?: string; comments?: Comment[] };
export type StoredPhoto = { id: string; path: string; lat?: number | null; lng?: number | null; caption?: string | null; taken_at?: string | null };
export type Comment = { id: string; entry_id: string | null; post_id: string | null; author_user: string | null; guest_name: string | null; text: string; created_at: string; author_name?: string };
export type EventRow = { id: string; host: string; name: string; kind: string; starts_on: string | null; ends_on: string | null; place: string | null; code: string; is_open: boolean; allow_guest_uploads: boolean; require_approval: boolean; guests_see: 'all' | 'own'; cover_path: string | null; link_expires_at: string | null; created_at: string };
export type Moment = { id: string; event_id: string; day: number; time_label: string | null; name: string; sort: number };
export type Post = { id: string; event_id: string; author_user: string | null; guest_name: string | null; text: string | null; audio_path: string | null; duration_ms: number | null; approved: boolean; created_at: string; moment_id: string | null; photos: { id: string; path: string }[]; comments: Comment[] };
export type Picked = { uri: string; lat?: number | null; lng?: number | null; takenAt?: string | null; caption?: string };
export type Draft = { photos: Picked[]; text: string; audioUri: string | null; durationMs: number; transcript?: string; recording?: boolean; processingAudio?: boolean };
export const emptyDraft = (): Draft => ({ photos: [], text: '', audioUri: null, durationMs: 0, transcript: '' });

const must = <T,>(r: { data: T | null; error: any }) => { if (r.error) throw r.error; return r.data as T; };
export const me = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
};

async function readAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const page = must(await query(from, from + 499)) ?? [];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
async function readForIds<T>(ids: string[], query: (ids: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>) {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    rows.push(...await readAll((from, to) => query(chunk, from, to)));
  }
  return rows;
}

async function removeUploaded(bucket: 'media' | 'event-media', paths: string[]) {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) throw error;
}

export async function myName() {
  const u = await me(); if (!u) return '';
  const data = must(await supabase.from('profiles').select('name').eq('id', u.id).maybeSingle()) as { name: string } | null;
  return data?.name || u.user_metadata?.name || '';
}
export async function saveName(name: string) {
  await writeProfile({ name });
}
export async function ensureProfile() {
  const u = await me(); if (!u) throw new Error('Please sign in again');
  must(await supabase.from('profiles').upsert({ id: u.id, name: u.user_metadata?.name ?? '' }, { onConflict: 'id', ignoreDuplicates: true }));
}
async function writeProfile(patch: Record<string, unknown>) {
  const u = await me(); if (!u) throw new Error('Please sign in again');
  // DO NOTHING avoids requiring SELECT on private preference/push-token columns.
  await ensureProfile();
  must(await supabase.from('profiles').update(patch).eq('id', u.id));
}

function requireDeleted(rows: unknown[] | null) {
  if (!rows?.length) throw new Error('This item was not deleted. It may have been removed already, or you do not have permission. Refresh and try again.');
}

// ---------- Stories ----------
export async function listStories(opts: { private?: boolean } = {}): Promise<Story[]> {
  const stories = await readAll<Story>((from, to) => supabase.from('stories').select('*').eq('private', !!opts.private).order('updated_at', { ascending: false }).order('id').range(from, to));
  if (stories.length && opts.private && !privateIsUnlocked()) throw new PrivateLockedError();
  if (!stories.length) return stories;
  const ids = stories.map(s => s.id);
  const entries = await readForIds<any>(ids, (chunk, from, to) => supabase.from('entries').select('id,story_id,text,transcript,entry_photos(path,sort,lat,lng,caption)').in('story_id', chunk).order('created_at', { ascending: true }).order('id').range(from, to));
  for (const s of stories) {
    const es = entries.filter(e => e.story_id === s.id);
    s.entryCount = es.length;
    const first = es.find(e => (e.entry_photos ?? []).length);
    s.cover = first ? first.entry_photos.sort((a: any, b: any) => a.sort - b.sort)[0].path : null;
    const located = es.flatMap(e => e.entry_photos ?? []).find((p: any) => p.lat != null && p.lng != null);
    s.lat = located?.lat ?? null; s.lng = located?.lng ?? null;
    s.searchText = [s.title, s.story_date, ...es.flatMap(e => [e.text, e.transcript, ...(e.entry_photos ?? []).map((p: any) => p.caption)])].filter(Boolean).join(' ').toLowerCase();
  }
  const links = await readForIds<any>(ids, (chunk, from, to) => supabase.from('story_people').select('story_id,person_id').in('story_id', chunk).order('story_id').order('person_id').range(from, to));
  for (const s of stories) s.peopleIds = links.filter((l: any) => l.story_id === s.id).map((l: any) => l.person_id);
  return stories;
}
export async function getStory(id: string) {
  const story = must(await supabase.from('stories').select('*').eq('id', id).single()) as Story;
  if (story.private && !privateIsUnlocked()) throw new PrivateLockedError();
  const rows = await readAll<any>((from, to) => supabase.from('entries').select('*, entry_photos(id,path,sort,lat,lng,caption,taken_at)').eq('story_id', id).order('created_at', { ascending: true }).order('id').range(from, to));
  const authors = [...new Set(rows.map(r => r.author))];
  const names = authors.length ? (must(await supabase.from('profiles').select('id,name').in('id', authors)) as any[]) : [];
  const cmts = await readForIds<Comment>(rows.map(r => r.id), (chunk, from, to) => supabase.from('comments').select('*').in('entry_id', chunk).order('created_at').order('id').range(from, to));
  const cAuthors = [...new Set(cmts.map(c => c.author_user).filter(Boolean))] as string[];
  const more = cAuthors.filter(a => !authors.includes(a));
  const allNames = more.length ? [...names, ...(must(await supabase.from('profiles').select('id,name').in('id', more)) as any[])] : names;
  for (const c of cmts) c.author_name = allNames.find(n => n.id === c.author_user)?.name ?? '';
  const entries: Entry[] = rows.map(r => ({ ...r, photos: (r.entry_photos ?? []).sort((a: any, b: any) => a.sort - b.sort), author_name: names.find(n => n.id === r.author)?.name ?? '', comments: cmts.filter(c => c.entry_id === r.id) }));
  return { story, entries };
}
async function addEntryFiles(storyId: string, d: Draft) {
  if (d.recording || d.processingAudio) throw new Error('Finish recording before saving.');
  if (!d.photos.length && !d.text.trim() && !d.audioUri) throw new Error('Add a photo, recording or a few words first.');
  const u = await me(); if (!u) throw new Error('Please sign in again');
  const story = must(await supabase.from('stories').select('private').eq('id', storyId).single()) as { private: boolean } | null;
  if (!story) throw new Error('Story not found.');
  if (story.private && !privateIsUnlocked()) throw new PrivateLockedError();
  const uploaded: string[] = [];
  let entryId: string | null = null;
  try {
    const audio = d.audioUri ? await uploadFile('media', `stories/${storyId}`, d.audioUri, 'm4a') : null;
    if (audio) uploaded.push(audio);
    const photos = [];
    for (const [sort, ph] of d.photos.entries()) {
      const path = await uploadFile('media', `stories/${storyId}`, ph.uri, 'jpg'); uploaded.push(path);
      photos.push({ path, sort, lat: ph.lat ?? null, lng: ph.lng ?? null, taken_at: ph.takenAt ?? null, caption: ph.caption?.trim() || null });
    }
    const entry = must(await supabase.from('entries').insert({ story_id: storyId, author: u.id, text: d.text.trim() || null, transcript: d.audioUri ? (d.transcript?.trim() || null) : null, audio_path: audio, duration_ms: d.audioUri ? d.durationMs : null }).select().single()) as Entry;
    entryId = entry.id;
    if (photos.length) must(await supabase.from('entry_photos').insert(photos.map(photo => ({ ...photo, entry_id: entry.id }))));
    return entry.id;
  } catch (error) {
    if (entryId) await supabase.from('entries').delete().eq('id', entryId);
    await removeUploaded('media', uploaded).catch(() => {});
    throw error;
  }
}
export async function createStory(title: string, storyDate: string, d: Draft, opts: { private?: boolean } = {}) {
  const u = await me(); if (!u) throw new Error('Please sign in again');
  if (opts.private && !privateIsUnlocked()) throw new PrivateLockedError();
  const s = must(await supabase.from('stories').insert({ title: title.trim() || 'Untitled story', story_date: storyDate, owner: u.id, private: !!opts.private }).select().single()) as Story;
  try { if (d.photos.length || d.text.trim() || d.audioUri) await addEntryFiles(s.id, d); }
  catch (error) { await supabase.from('stories').delete().eq('id', s.id); throw error; }
  return s.id;
}
export const addToStory = (storyId: string, d: Draft) => addEntryFiles(storyId, d);
export async function deleteEntry(e: Entry) {
  const paths = [...e.photos.map(p => p.path), ...(e.audio_path ? [e.audio_path] : [])];
  requireDeleted(must(await supabase.from('entries').delete().eq('id', e.id).select('id')));
  await removeUploaded('media', paths).catch(() => {}); // Server cleanup queue retries inaccessible files.
}
export async function updateStory(id: string, patch: Partial<Pick<Story, 'title' | 'hidden_from_memories' | 'closed' | 'story_date' | 'private'>>) {
  must(await supabase.from('stories').update(patch).eq('id', id));
}
export async function deleteStory(id: string) {
  const { entries } = await getStory(id);
  const paths = entries.flatMap(e => [...e.photos.map(p => p.path), ...(e.audio_path ? [e.audio_path] : [])]);
  requireDeleted(must(await supabase.from('stories').delete().eq('id', id).select('id')));
  await removeUploaded('media', paths).catch(() => {});
}
export async function inviteCode(storyId: string) {
  const existing = must(await supabase.from('story_invites').select('code').eq('story_id', storyId).limit(1)) as any[];
  if (existing.length) return existing[0].code as string;
  return (must(await supabase.from('story_invites').insert({ story_id: storyId }).select('code').single()) as any).code as string;
}
export async function joinStory(code: string) {
  return must(await supabase.rpc('join_story', { invite: code })) as unknown as string;
}

// ---------- Events ----------
export async function listEvents(): Promise<EventRow[]> {
  return readAll<EventRow>((from, to) => supabase.from('events').select('*').order('starts_on', { ascending: false, nullsFirst: false }).order('id').range(from, to));
}
export async function createEvent(e: { name: string; kind: string; starts_on: string | null; ends_on: string | null; place: string }, moments: { day: number; time_label: string; name: string }[], coverUri?: string | null) {
  const u = await me(); if (!u) throw new Error('Please sign in again');
  const ev = must(await supabase.from('events').insert({ ...e, host: u.id }).select().single()) as EventRow;
  try {
    if (coverUri) await setCover(ev.id, coverUri);
    if (moments.length) must(await supabase.from('event_moments').insert(moments.map((m, i) => ({ ...m, event_id: ev.id, sort: i }))));
  } catch (error) { await supabase.from('events').delete().eq('id', ev.id); throw error; }
  return ev.id;
}
export async function getEvent(id: string) {
  const ev = must(await supabase.from('events').select('*').eq('id', id).single()) as EventRow;
  const moments = must(await supabase.from('event_moments').select('*').eq('event_id', id).order('day').order('sort')) as Moment[];
  const rows = await readAll<any>((from, to) => supabase.from('event_posts').select('*, event_post_photos(id,path,sort)').eq('event_id', id).order('created_at', { ascending: false }).order('id').range(from, to));
  const cmts = await readForIds<Comment>(rows.map(r => r.id), (chunk, from, to) => supabase.from('comments').select('*').in('post_id', chunk).order('created_at').order('id').range(from, to));
  const posts: Post[] = rows.map(r => ({ ...r, photos: (r.event_post_photos ?? []).sort((a: any, b: any) => a.sort - b.sort), comments: cmts.filter(c => c.post_id === r.id) }));
  return { ev, moments, posts };
}
export async function updateEvent(id: string, patch: Partial<EventRow>) { must(await supabase.from('events').update(patch).eq('id', id)); }
export async function deleteEvent(id: string) { requireDeleted(must(await supabase.from('events').delete().eq('id', id).select('id'))); }
export async function hostPost(eventId: string, d: Draft, momentId: string | null = null) {
  if (d.recording || d.processingAudio) throw new Error('Finish recording before saving.');
  if (!d.photos.length && !d.text.trim() && !d.audioUri) throw new Error('Add something first.');
  const u = await me(); if (!u) throw new Error('Please sign in again');
  const event = must(await supabase.from('events').select('is_open').eq('id', eventId).single()) as { is_open: boolean };
  if (!event.is_open) throw new Error('This wall is closed. Reopen it before adding.');
  const uploaded: string[] = [];
  let postId: string | null = null;
  try {
  const audio = d.audioUri ? await uploadFile('event-media', eventId, d.audioUri, 'm4a') : null;
  if (audio) uploaded.push(audio);
  const photos = [];
  for (const [sort, ph] of d.photos.entries()) {
    const path = await uploadFile('event-media', eventId, ph.uri, 'jpg'); uploaded.push(path);
    photos.push({ path, sort });
  }
  const post = must(await supabase.from('event_posts').insert({ event_id: eventId, author_user: u.id, text: d.text.trim() || null, audio_path: audio, duration_ms: d.audioUri ? d.durationMs : null, moment_id: momentId }).select().single()) as any;
  postId = post.id;
  if (photos.length) must(await supabase.from('event_post_photos').insert(photos.map(photo => ({ ...photo, post_id: post.id }))));
  } catch (error) {
    if (postId) await supabase.from('event_posts').delete().eq('id', postId);
    await removeUploaded('event-media', uploaded).catch(() => {});
    throw error;
  }
}
export async function approvePost(id: string) { must(await supabase.from('event_posts').update({ approved: true }).eq('id', id)); }
export async function deletePost(p: Post) {
  const paths = [...p.photos.map(x => x.path), ...(p.audio_path ? [p.audio_path] : [])];
  requireDeleted(must(await supabase.from('event_posts').delete().eq('id', p.id).select('id')));
  await removeUploaded('event-media', paths).catch(() => {});
}
export async function addMoment(eventId: string, m: { day: number; time_label: string; name: string }) {
  must(await supabase.from('event_moments').insert({ ...m, event_id: eventId, sort: Math.floor(Date.now() / 1000) }));
}
export async function deleteMoment(id: string) { must(await supabase.from('event_moments').delete().eq('id', id)); }

// ---------- Account ----------
export async function deleteAccount() { must(await supabase.rpc('delete_my_account')); await supabase.auth.signOut(); }

export async function saveTranscript(entryId: string, transcript: string) { must(await supabase.from('entries').update({ transcript }).eq('id', entryId)); }

// ---------- People Pages ----------
export type Person = { id: string; name: string; relation: string | null; created_at: string; storyCount?: number; cover?: string | null };
export async function listPeople(): Promise<Person[]> {
  const people = must(await supabase.from('people').select('*').order('name')) as Person[];
  if (!people.length) return people;
  const links = must(await supabase.from('story_people').select('person_id,story_id').in('person_id', people.map(p => p.id))) as any[];
  for (const p of people) p.storyCount = links.filter(l => l.person_id === p.id).length;
  return people;
}
export async function addPerson(name: string, relation?: string) {
  return (must(await supabase.from('people').insert({ name: name.trim(), relation: relation?.trim() || null }).select().single()) as Person).id;
}
export async function deletePerson(id: string) { must(await supabase.from('people').delete().eq('id', id)); }
export async function peopleInStory(storyId: string) {
  return (must(await supabase.from('story_people').select('person_id').eq('story_id', storyId)) as any[]).map(r => r.person_id as string);
}
export async function setPeopleInStory(storyId: string, personIds: string[]) {
  const current = await peopleInStory(storyId);
  const add = personIds.filter(id => !current.includes(id)), remove = current.filter(id => !personIds.includes(id));
  if (add.length) must(await supabase.from('story_people').insert(add.map(person_id => ({ story_id: storyId, person_id }))));
  if (remove.length) must(await supabase.from('story_people').delete().eq('story_id', storyId).in('person_id', remove));
}
export async function getPerson(id: string) {
  const person = must(await supabase.from('people').select('*').eq('id', id).single()) as Person;
  const ids = (must(await supabase.from('story_people').select('story_id').eq('person_id', id)) as any[]).map(r => r.story_id);
  const all = await listStories();
  const stories = all.filter(s => ids.includes(s.id)).sort((a, b) => a.story_date.localeCompare(b.story_date));
  return { person, stories };
}

// ---------- Notifications ----------
export async function savePushToken(token: string | null) {
  await writeProfile({ push_token: token });
}

export async function setCover(eventId: string, uri: string) {
  const path = await uploadFile('event-media', eventId, uri, 'jpg');
  const old = (await supabase.from('events').select('cover_path').eq('id', eventId).single()).data?.cover_path;
  try { must(await supabase.from('events').update({ cover_path: path }).eq('id', eventId)); }
  catch (error) { await removeUploaded('event-media', [path]).catch(() => {}); throw error; }
  if (old) await supabase.storage.from('event-media').remove([old]);
}
export async function newEventLink(eventId: string) {
  return must(await supabase.rpc('rotate_event_link', { event_id: eventId })) as string;
}
export async function updateMoment(id: string, patch: Partial<Pick<Moment, 'name' | 'time_label' | 'day' | 'sort'>>) { must(await supabase.from('event_moments').update(patch).eq('id', id)); }

// ---------- Comments ----------
export async function addComment(target: { entry_id?: string; post_id?: string }, text: string) {
  const u = await me(); if (!u) throw new Error('Please sign in again');
  if (!text.trim()) throw new Error('Write a comment first.');
  if (!!target.entry_id === !!target.post_id) throw new Error('Choose one moment to comment on.');
  must(await supabase.from('comments').insert({ ...target, author_user: u.id, text: text.trim() }));
}
export async function deleteComment(id: string) { requireDeleted(must(await supabase.from('comments').delete().eq('id', id).select('id'))); }

// ---------- Favourites ----------
export type FavPhoto = StoredPhoto & { story_id: string; story_title: string };
export async function favouriteIds(): Promise<string[]> {
  return (must(await supabase.from('favourites').select('photo_id')) ?? []).map((r: any) => r.photo_id);
}
export async function toggleFavourite(photoId: string, on: boolean) {
  if (on) must(await supabase.from('favourites').upsert({ photo_id: photoId }));
  else must(await supabase.from('favourites').delete().eq('photo_id', photoId));
}
export async function listFavourites(): Promise<FavPhoto[]> {
  const rows = must(await supabase.from('favourites').select('created_at, entry_photos(id,path,lat,lng,caption,taken_at, entries(story_id, stories(title,private)))').order('created_at', { ascending: false })) as any[];
  return rows.filter(r => r.entry_photos && r.entry_photos.entries?.stories && !r.entry_photos.entries.stories.private).map(r => { const p = r.entry_photos; return { id: p.id, path: p.path, lat: p.lat, lng: p.lng, caption: p.caption, taken_at: p.taken_at, story_id: p.entries?.story_id, story_title: p.entries?.stories?.title ?? '' }; });
}

// ---------- People: richer page, hiding ----------
export async function setPersonHidden(id: string, hidden: boolean) { must(await supabase.from('people').update({ hidden_from_memories: hidden }).eq('id', id)); }
export async function photosInStories(storyIds: string[], limit = 18): Promise<(StoredPhoto & { story_id: string })[]> {
  if (!storyIds.length) return [];
  const rows = must(await supabase.from('entries').select('story_id, entry_photos(id,path,lat,lng,caption,taken_at,sort)').in('story_id', storyIds).order('created_at', { ascending: false })) as any[];
  return rows.flatMap(r => (r.entry_photos ?? []).map((p: any) => ({ ...p, story_id: r.story_id }))).slice(0, limit);
}

// ---------- Hard memories: dates ----------
export type SkipDate = { id: string; month: number; day: number; label: string | null };
export async function listSkipDates(): Promise<SkipDate[]> { return must(await supabase.from('skip_dates').select('*').order('month').order('day')) as SkipDate[]; }
export async function addSkipDate(month: number, day: number, label?: string) { must(await supabase.from('skip_dates').insert({ month, day, label: label?.trim() || null })); }
export async function deleteSkipDate(id: string) { must(await supabase.from('skip_dates').delete().eq('id', id)); }
/** Stories that may come back as memories: not hidden, not private, no hidden people, not on a skipped date. */
export async function memoryFilter() {
  const hiddenPeople = ((await supabase.from('people').select('id').eq('hidden_from_memories', true)).data ?? []).map((r: any) => r.id as string);
  const skips = await listSkipDates();
  return (s: Story) => {
    if (s.hidden_from_memories || s.private) return false;
    if ((s.peopleIds ?? []).some(id => hiddenPeople.includes(id))) return false;
    const d = parseDate(s.story_date);
    return !skips.some(k => k.month === d.getMonth() + 1 && k.day === d.getDate());
  };
}

// ---------- Sign-up choices ----------
export async function saveProfileChoices(interests: string[], morningMemory: boolean) {
  await writeProfile({ interests, morning_memory: morningMemory });
}
