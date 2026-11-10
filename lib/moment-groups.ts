import AsyncStorage from '@react-native-async-storage/async-storage';

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
