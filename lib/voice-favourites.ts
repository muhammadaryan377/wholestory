import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export type VoiceFavourite = { id: string; story_id: string; story_title: string; audio_path: string; duration_ms: number | null; transcript: string | null; created_at: string };

const storageKey = (userId: string) => 'ws_voice_favourites_v1_' + userId;

export async function voiceFavouriteIds(userId: string): Promise<string[]> {
  try {
    const raw: unknown = JSON.parse((await AsyncStorage.getItem(storageKey(userId))) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

export async function toggleVoiceFavourite(userId: string, entryId: string, on: boolean) {
  const current = await voiceFavouriteIds(userId);
  const next = on ? [entryId, ...current.filter(id => id !== entryId)] : current.filter(id => id !== entryId);
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
  return next;
}

/** Newest favourite first. Deleted recordings and private stories are left out. */
export async function listVoiceFavourites(): Promise<VoiceFavourite[]> {
  const userId = (await supabase.auth.getSession()).data.session?.user.id;
  if (!userId) return [];
  const ids = await voiceFavouriteIds(userId);
  if (!ids.length) return [];
  const { data, error } = await supabase.from('entries').select('id,story_id,audio_path,duration_ms,transcript,created_at,stories(title,private)').in('id', ids);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  return ids.flatMap(id => {
    const row = rows.find(r => r.id === id);
    if (!row?.audio_path || !row.stories || row.stories.private) return [];
    return [{ id: row.id, story_id: row.story_id, story_title: row.stories.title ?? '', audio_path: row.audio_path, duration_ms: row.duration_ms, transcript: row.transcript, created_at: row.created_at }];
  });
}
