import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ML from 'expo-media-library/legacy';
import { Platform } from 'react-native';
import type { Picked } from './api';
import { placeNames } from './places';
import { clusterSuggestionAssets, formatSuggestionTitle, isMemoryPhotoAsset } from './suggest-groups';
import { supabase } from './supabase';
import { readNamedMoments } from './moment-groups';

export type Suggestion = { id: string; title: string; sub: string; start: number; end: number; assets: ML.Asset[] };
const DISMISSED = 'ws_suggest_dismissed';

export async function libraryAllowed(ask = false) {
  if (Platform.OS === 'web') return false;
  const p = ask ? await ML.requestPermissionsAsync(false, ['photo']) : await ML.getPermissionsAsync(false, ['photo']);
  return p.granted || p.accessPrivileges === 'limited';
}
export async function dismissed(): Promise<string[]> { try { return JSON.parse((await AsyncStorage.getItem(DISMISSED)) ?? '[]'); } catch { return []; } }
export async function dismiss(id: string) { const d = await dismissed(); await AsyncStorage.setItem(DISMISSED, JSON.stringify([...d, id])); }

function sampleClusterAssets(assets: ML.Asset[], count = 4): ML.Asset[] {
  if (assets.length <= count) return assets;
  const indices = [...new Set(Array.from({ length: count }, (_, i) => Math.round((i * (assets.length - 1)) / (count - 1))))];
  return indices.map(i => assets[i]);
}

async function resolveClusterPlaces(clusters: { id: string; assets: ML.Asset[] }[]): Promise<Record<string, string[]>> {
  const points: { id: string; lat: number; lng: number }[] = [];
  const sampleOwners = new Map<string, string>();
  for (const cluster of clusters) {
    const samples = sampleClusterAssets(cluster.assets, 4);
    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i];
      try {
        const info = await ML.getAssetInfoAsync(sample);
        if (info.location?.latitude != null && info.location?.longitude != null) {
          const pointId = `${cluster.id}:${i}`;
          points.push({ id: pointId, lat: info.location.latitude, lng: info.location.longitude });
          sampleOwners.set(pointId, cluster.id);
        }
      } catch {
        // Ignore unreadable EXIF on individual photos.
      }
    }
  }
  if (!points.length) return {};
  const names = await placeNames(points).catch((): Record<string, string> => ({}));
  const byCluster: Record<string, string[]> = {};
  for (const [pointId, place] of Object.entries(names)) {
    const cid = sampleOwners.get(pointId);
    if (!cid) continue;
    byCluster[cid] = [...(byCluster[cid] ?? []), place];
  }
  return byCluster;
}

/**
 * Groups the last two years of real camera photos (excluding screenshots) into
 * trips and outings, named with resolved places and exact date ranges. Runs on the phone.
 */
export async function findSuggestions(max = 12): Promise<Suggestion[]> {
  if (!(await libraryAllowed())) return [];
  const since = Date.now() - 730 * 864e5;
  const page = await ML.getAssetsAsync({ mediaType: 'photo', sortBy: [['creationTime', false]], first: 3000, createdAfter: since });
  const assets = page.assets.filter(isMemoryPhotoAsset);
  const skip = await dismissed();
  const userId = (await supabase.auth.getSession()).data.session?.user.id;
  const saved = userId ? await readNamedMoments(userId) : [];
  const byId = new Map(page.assets.filter(a => a.creationTime).map(a => [a.id, a]));
  const assigned = new Set(saved.flatMap(g => g.assetIds));
  const manual: Suggestion[] = saved.map(group => {
    const list = group.assetIds.map(id => byId.get(id)).filter((a): a is ML.Asset => !!a);
    if (!list.length) return null;
    const times = list.map(a => a.creationTime).filter(Boolean);
    return { id: `named-${group.id}`, title: group.title, sub: `${list.length} photos · named by you`, start: Math.min(...times), end: Math.max(...times), assets: list };
  }).filter((g): g is Suggestion => g !== null);

  const rawGroups = clusterSuggestionAssets(assets.filter(a => !assigned.has(a.id)))
    .map(g => {
      const end = g[0].creationTime, start = g[g.length - 1].creationTime;
      return { id: `${start}-${g.length}`, start, end, assets: g };
    })
    .filter(s => !skip.includes(s.id))
    .slice(0, max);

  const placeMap = await resolveClusterPlaces(rawGroups);
  const automatic: Suggestion[] = rawGroups.map(g => {
    const days = Math.max(1, Math.round((g.end - g.start) / 864e5) + 1);
    const title = formatSuggestionTitle(placeMap[g.id] ?? [], g.start, g.end);
    return {
      id: g.id,
      title,
      sub: `${g.assets.length} photos${days >= 2 ? ` · ${days} days` : ''}`,
      start: g.start,
      end: g.end,
      assets: g.assets,
    };
  });

  return [...manual, ...automatic].filter(s => !skip.includes(s.id)).slice(0, max);
}

/** Turns library photos into files the app can upload, with their place and time. */
export async function toPicked(assets: ML.Asset[], limit = 12): Promise<Picked[]> {
  const step = Math.max(1, Math.floor(assets.length / limit));
  const chosen = assets.filter((_, i) => i % step === 0).slice(0, limit);
  const out: Picked[] = [];
  for (const a of chosen) {
    const info = await ML.getAssetInfoAsync(a);
    const uri = info.localUri ?? (a.uri.startsWith('file:') || a.uri.startsWith('content:') ? a.uri : null);
    if (!uri) continue;
    out.push({ uri, lat: info.location?.latitude ?? null, lng: info.location?.longitude ?? null, takenAt: new Date(a.creationTime).toISOString() });
  }
  return out;
}

/** How many photos are in the library (for "We found 312 photos"). */
export async function countPhotos() {
  try { return (await ML.getAssetsAsync({ mediaType: 'photo', first: 1 })).totalCount; } catch { return 0; }
}
