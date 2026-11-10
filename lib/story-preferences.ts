import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { listFavourites, listStories, type Story } from './api';

export const STORY_CATEGORIES = ['Travel', 'Events', 'Family', 'Everyday life', 'Friends'] as const;
export type StoryCategory = typeof STORY_CATEGORIES[number];
export type StoryLocation = { lat: number; lng: number; source: 'current' | 'manual' };
export type StoryPreference = { category?: StoryCategory; location?: StoryLocation; tags?: string[]; favourite?: boolean };
export type StoryWithPreference = Story & { category?: StoryCategory; explicitLocation?: StoryLocation; tags?: string[]; favourite?: boolean };

const storageKey = (userId: string) => 'ws_story_preferences_v1_' + userId;
const growthKey = (userId: string) => 'ws_story_growth_seen_v1_' + userId;
const MAX_TAGS = 5, MAX_TAG_LENGTH = 24;
const cleanTags = (tags: unknown) => Array.isArray(tags)
  ? [...new Set(tags.filter((t): t is string => typeof t === 'string').map(t => t.trim().slice(0, MAX_TAG_LENGTH)).filter(Boolean))].slice(0, MAX_TAGS)
  : [];
const validLocation = (loc: unknown): loc is StoryLocation => {
  if (!loc || typeof loc !== 'object') return false;
  const v = loc as Partial<StoryLocation>;
  return typeof v.lat === 'number' && Number.isFinite(v.lat) && v.lat >= -90 && v.lat <= 90 &&
    typeof v.lng === 'number' && Number.isFinite(v.lng) && v.lng >= -180 && v.lng <= 180 &&
    (v.source === 'current' || v.source === 'manual');
};

export async function getStoryPreferences(userId: string): Promise<Record<string, StoryPreference>> {
  try {
    const raw: unknown = JSON.parse((await AsyncStorage.getItem(storageKey(userId))) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const safe: Record<string, StoryPreference> = {};
    for (const [id, item] of Object.entries(raw)) {
      if (!item || typeof item !== 'object' || !/^[0-9a-f-]{20,40}$/i.test(id)) continue;
      const record = item as StoryPreference;
      safe[id] = {
        ...(STORY_CATEGORIES.includes(record.category as StoryCategory) ? { category: record.category } : {}),
        ...(validLocation(record.location) ? { location: record.location } : {}),
        ...(cleanTags(record.tags).length ? { tags: cleanTags(record.tags) } : {}),
        ...(typeof record.favourite === 'boolean' ? { favourite: record.favourite } : {}),
      };
    }
    return safe;
  } catch { return {}; }
}

/** Opt-in metadata is local to the signed-in user and never tracks the phone. */
export async function saveStoryPreference(userId: string, storyId: string, patch: StoryPreference) {
  const all = await getStoryPreferences(userId);
  const existing = all[storyId] ?? {};
  const next: StoryPreference = { ...existing };
  if (patch.category !== undefined) {
    if (!STORY_CATEGORIES.includes(patch.category)) throw new Error('Invalid category');
    next.category = patch.category;
  }
  if (patch.location !== undefined) {
    if (!validLocation(patch.location)) throw new Error('Invalid location');
    next.location = patch.location;
  }
  if (patch.tags !== undefined) next.tags = cleanTags(patch.tags);
  if (patch.favourite !== undefined) next.favourite = patch.favourite;
  all[storyId] = next;
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(all));
}

export async function clearStoryLocation(userId: string, storyId: string) {
  const all = await getStoryPreferences(userId);
  if (!all[storyId]) return;
  delete all[storyId].location;
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(all));
}

export async function clearStoryPreference(userId: string, storyId: string) {
  const all = await getStoryPreferences(userId);
  delete all[storyId];
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(all));
}

async function favouritePhotoStories() {
  try { return new Set((await listFavourites()).map(photo => photo.story_id)); }
  catch { return new Set<string>(); }
}

/** When each story's "has grown" card was last opened on this phone. */
export async function getGrowthSeen(userId: string): Promise<Record<string, string>> {
  try {
    const raw: unknown = JSON.parse((await AsyncStorage.getItem(growthKey(userId))) ?? '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, string> : {};
  } catch { return {}; }
}
export async function markGrowthSeen(userId: string, storyId: string, at: string) {
  await AsyncStorage.setItem(growthKey(userId), JSON.stringify({ ...await getGrowthSeen(userId), [storyId]: at }));
}

/** Keeps existing real photo GPS when no explicit location was chosen. */
export async function listStoriesWithPreferences(): Promise<StoryWithPreference[]> {
  const stories = await listStories();
  const userId = (await supabase.auth.getSession()).data.session?.user.id;
  if (!userId) return stories;
  const [saved, hearted] = await Promise.all([getStoryPreferences(userId), favouritePhotoStories()]);
  return stories.map(story => {
    const pref = saved[story.id];
    // A story with a hearted photo counts as a favourite until someone says otherwise.
    const favourite = pref?.favourite ?? hearted.has(story.id);
    return pref ? {
      ...story,
      category: pref.category,
      tags: pref.tags,
      favourite,
      explicitLocation: pref.location,
      lat: pref.location?.lat ?? story.lat,
      lng: pref.location?.lng ?? story.lng,
    } : { ...story, favourite };
  });
}
