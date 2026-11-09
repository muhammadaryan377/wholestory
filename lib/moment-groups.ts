import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export type NamedMoment = { id: string; title: string; assetIds: string[] };
const keyFor = (userId: string) => `ws_named_moments_${userId}`;

export async function readNamedMoments(userId: string): Promise<NamedMoment[]> {
  try {
    const parsed: unknown = JSON.parse((await AsyncStorage.getItem(keyFor(userId))) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is NamedMoment =>
      !!value && typeof value === 'object'
      && typeof value.id === 'string' && typeof value.title === 'string'
      && Array.isArray(value.assetIds)
      && value.assetIds.every((id: unknown) => typeof id === 'string')
    ).slice(0, 60);
  } catch { return []; }
}

/** Names and asset IDs remain on this device. Photos are never uploaded by grouping. */
export async function saveNamedMoments(userId: string, groups: NamedMoment[]) {
  const safe = groups
    .filter(group => group.title.trim() && group.assetIds.length)
    .slice(0, 60)
    .map(group => ({
      id: group.id,
      title: group.title.trim().slice(0, 90),
      assetIds: [...new Set(group.assetIds)].slice(0, 3000),
    }));
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(safe));
}

export const setupKey = (userId: string) => `ws_onboarded_${userId}`;
export async function isSetupComplete(userId: string): Promise<boolean> {
  const value = await AsyncStorage.getItem(setupKey(userId));
  if (value !== null) return value === '1';
  // Set when setup finishes, so a reinstall or a new phone does not repeat it.
  const { data: auth } = await supabase.auth.getSession();
  if (auth.session?.user.id === userId && auth.session.user.user_metadata?.setup_complete === true) {
    await AsyncStorage.setItem(setupKey(userId), '1');
    return true;
  }
  // Compatibility with accounts that completed the original setup flow.
  if ((await AsyncStorage.getItem('ws_onboarded')) !== '1') return false;
  // The old global flag belongs to an earlier install, not necessarily this
  // account. Only treat it as complete when this user's profile has interests.
  const { data, error } = await supabase.from('profiles').select('interests').eq('id', userId).maybeSingle();
  if (error) return true; // Don't strand existing signed-in users during outages.
  return Array.isArray(data?.interests) && data.interests.length > 0;
}
export async function markSetupComplete(userId: string) {
  await AsyncStorage.setItem(setupKey(userId), '1');
  // Best effort: finishing setup must still work offline.
  await supabase.auth.updateUser({ data: { setup_complete: true } }).catch(() => {});
}
