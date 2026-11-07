import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { listStories, type Story } from './api';

export const STORY_CATEGORIES = ['Travel', 'Family', 'Events', 'Friends', 'Everyday life'] as const;
export type StoryCategory = typeof STORY_CATEGORIES[number];
export type StoryLocation = { lat: number; lng: number; source: 'current' | 'manual' };
export type StoryPreference = { category?: StoryCategory; location?: StoryLocation };
export type StoryWithPreference = Story & { category?: StoryCategory; explicitLocation?: StoryLocation };

const storageKey = (userId: string) => 'ws_story_preferences_v1_' + userId;
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

/** Keeps existing real photo GPS when no explicit location was chosen. */
export async function listStoriesWithPreferences(): Promise<StoryWithPreference[]> {
  const stories = await listStories();
  const userId = (await supabase.auth.getSession()).data.session?.user.id;
  if (!userId) return stories;
  const saved = await getStoryPreferences(userId);
  return stories.map(story => {
    const pref = saved[story.id];
    return pref ? {
      ...story,
      category: pref.category,
      explicitLocation: pref.location,
      lat: pref.location?.lat ?? story.lat,
      lng: pref.location?.lng ?? story.lng,
    } : story;
  });
}
