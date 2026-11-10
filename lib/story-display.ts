import { parseDate } from '@/lib/dates';
import type { StoryCategory, StoryWithPreference } from '@/lib/story-preferences';

export const plural = (count: number, word: string, many = word + 's') => `${count} ${count === 1 ? word : many}`;

/** A year below this comes from a photo with a broken camera clock. */
const EARLIEST_YEAR = 1990;
const shortDate = (date: string) => parseDate(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
function storyYears(story: StoryWithPreference) {
  return [
    parseDate(story.story_date).getFullYear(),
    ...(story.takenDates ?? []).map(date => new Date(date).getFullYear()).filter(year => Number.isFinite(year) && year >= EARLIEST_YEAR),
  ];
}

/** One date when a story sits inside a single year, otherwise "2021 - 2026". */
export function storySpan(story: StoryWithPreference) {
  const years = storyYears(story);
  const first = Math.min(...years), last = Math.max(...years);
  return first === last ? shortDate(story.story_date) : `${first} - ${last}`;
}

export function storyMeta(story: StoryWithPreference) {
  const parts = [plural(story.entryCount ?? 0, 'chapter'), storySpan(story)];
  if (story.photoCount) parts.push(plural(story.photoCount, 'photo'));
  return parts.join(' · ');
}

export const memoryDate = shortDate;

export type StoryThread = { key: 'All' | StoryCategory; title: string; sub: string; cover: string | null };
const THREAD_TITLES: Record<StoryCategory, string> = {
  Travel: 'Travel adventures', Events: 'Special events', Family: 'Our family', 'Everyday life': 'Everyday life', Friends: 'Good friends',
};

/** "Our story" holds everything; every category someone has used becomes its own thread. */
export function buildThreads(stories: StoryWithPreference[]): StoryThread[] {
  if (!stories.length) return [];
  const coverOf = (list: StoryWithPreference[]) => list.find(story => story.cover)?.cover ?? null;
  const firstYear = Math.min(...stories.flatMap(storyYears));
  const threads: StoryThread[] = [{ key: 'All', title: 'Our story', sub: `Together from ${firstYear} · today`, cover: coverOf(stories) }];
  for (const key of Object.keys(THREAD_TITLES) as StoryCategory[]) {
    const list = stories.filter(story => story.category === key);
    if (!list.length) continue;
    const chapters = list.reduce((sum, story) => sum + (story.entryCount ?? 0), 0);
    const photos = list.reduce((sum, story) => sum + (story.photoCount ?? 0), 0);
    threads.push({ key, title: THREAD_TITLES[key], sub: `${plural(chapters, 'chapter')} · ${plural(photos, 'photo')}`, cover: coverOf(list) });
  }
  return threads;
}

export type MapZoom = { latitudeDelta: number; longitudeDelta: number };
export type MapCluster = { key: string; lat: number; lng: number; stories: StoryWithPreference[]; photos: number; cover: string | null; label: string };

/** Joins stories whose pins would overlap at the current zoom. */
export function clusterStories(stories: StoryWithPreference[], zoom: MapZoom): MapCluster[] {
  const latCell = zoom.latitudeDelta / 5, lngCell = zoom.longitudeDelta / 5;
  const groups: { lat: number; lng: number; stories: StoryWithPreference[] }[] = [];
  for (const story of stories) {
    if (story.lat == null || story.lng == null) continue;
    const near = groups.find(group => Math.abs(group.lat - story.lat!) < latCell && Math.abs(group.lng - story.lng!) < lngCell);
    if (near) near.stories.push(story);
    else groups.push({ lat: story.lat, lng: story.lng, stories: [story] });
  }
  return groups.map(group => ({
    key: group.stories.map(story => story.id).join('|'),
    lat: group.stories.reduce((sum, story) => sum + story.lat!, 0) / group.stories.length,
    lng: group.stories.reduce((sum, story) => sum + story.lng!, 0) / group.stories.length,
    stories: group.stories,
    photos: group.stories.reduce((sum, story) => sum + (story.photoCount ?? 0), 0),
    cover: group.stories.find(story => story.cover)?.cover ?? null,
    label: '',
  }));
}

export type StoryGrowth = { story: StoryWithPreference; latest: string; message: string };
const GROWTH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** The story that most recently received something from another person since it was last opened from this card. */
export function findStoryGrowth(stories: StoryWithPreference[], userId: string, seen: Record<string, string>, now = Date.now()): StoryGrowth | null {
  let best: StoryGrowth | null = null;
  for (const story of stories) {
    const after = Math.max(now - GROWTH_WINDOW_MS, seen[story.id] ? Date.parse(seen[story.id]) : 0);
    const fresh = (story.activity ?? []).filter(item => item.author !== userId && Date.parse(item.created_at) > after);
    if (!fresh.length) continue;
    const latest = fresh.map(item => item.created_at).sort().at(-1)!;
    if (best && best.latest >= latest) continue;
    const photos = fresh.reduce((sum, item) => sum + item.photos, 0);
    const voices = fresh.filter(item => item.voice).length;
    const parts = [
      photos ? plural(photos, 'new photo') : '',
      voices === 1 ? 'a voice story' : voices ? `${voices} voice stories` : '',
    ].filter(Boolean);
    const what = parts.length ? parts.join(' and ') : plural(fresh.length, 'new chapter');
    const single = parts.length ? photos + voices === 1 : fresh.length === 1;
    best = { story, latest, message: `${what} ${single ? 'was' : 'were'} added to ${story.title}` };
  }
  return best;
}
