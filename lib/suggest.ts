import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ML from 'expo-media-library/legacy';
import { Platform } from 'react-native';
import type { Picked } from './api';
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

/** Groups the last two years of photos into moments worth telling: days or trips with many photos. Runs on the phone. */
export async function findSuggestions(max = 12): Promise<Suggestion[]> {
  if (!(await libraryAllowed())) return [];
  const since = Date.now() - 730 * 864e5;
  const page = await ML.getAssetsAsync({ mediaType: 'photo', sortBy: [[ 'creationTime', false ]], first: 3000, createdAfter: since });
  const assets = page.assets.filter(a => a.creationTime);
  const groups: ML.Asset[][] = [];
  for (const a of assets) {
    const g = groups[groups.length - 1];
    if (g && g[g.length - 1].creationTime - a.creationTime < 30 * 3600 * 1000 && g[0].creationTime - a.creationTime < 14 * 864e5) g.push(a); else groups.push([a]);
  }
  const skip = await dismissed();
  const userId = (await supabase.auth.getSession()).data.session?.user.id;
  const saved = userId ? await readNamedMoments(userId) : [];
  const byId = new Map(assets.map(a => [a.id, a]));
  const assigned = new Set(saved.flatMap(g => g.assetIds));
  const manual: Suggestion[] = saved.map(group => {
    const list = group.assetIds.map(id => byId.get(id)).filter((a): a is ML.Asset => !!a);
    if (!list.length) return null;
    const times = list.map(a => a.creationTime).filter(Boolean);
    return { id: `named-${group.id}`, title: group.title, sub: `${list.length} photos · named by you`, start: Math.min(...times), end: Math.max(...times), assets: list };
  }).filter((g): g is Suggestion => g !== null);
  const automatic = groups
    .map(g => g.filter(a => !assigned.has(a.id)))
    .filter(g => g.length >= 8)
    .map(g => {
      const end = g[0].creationTime, start = g[g.length - 1].creationTime;
      const days = Math.max(1, Math.round((end - start) / 864e5) + 1);
      const d = new Date(start);
      const title = days >= 2 ? `${days} days in ${d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}` : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      return { id: `${start}-${g.length}`, title, sub: `${g.length} photos${days >= 2 ? ` · ${days} days` : ''}`, start, end, assets: g };
    })
    .filter(s => !skip.includes(s.id));
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
