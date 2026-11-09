import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

const CACHE_KEY = 'ws_place_names_v1';
/** Geocoding is slow and rate limited, so each load looks up only a few new places. */
const MAX_LOOKUPS = 12;
const cell = (lat: number, lng: number) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

type Point = { id: string; lat: number; lng: number };

async function readCache(): Promise<Record<string, string>> {
  try {
    const raw: unknown = JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) ?? '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, string> : {};
  } catch { return {}; }
}

/** Town names for coordinates, keyed by point id. Points without a known name are left out. */
export async function placeNames(points: Point[]): Promise<Record<string, string>> {
  if (!points.length) return {};
  const cache = await readCache();
  // Android refuses to geocode without location permission, and labels are not worth asking for it.
  const canLookUp = Platform.OS === 'ios' ||
    (Platform.OS === 'android' && await Location.getForegroundPermissionsAsync().then(p => p.granted).catch(() => false));
  if (canLookUp) {
    const missing = [...new Set(points.map(p => cell(p.lat, p.lng)).filter(key => !cache[key]))].slice(0, MAX_LOOKUPS);
    let changed = false;
    for (const key of missing) {
      const [latitude, longitude] = key.split(',').map(Number);
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
        const name = place?.city ?? place?.subregion ?? place?.region ?? place?.country;
        if (name) { cache[key] = name; changed = true; }
      } catch { break; }
    }
    if (changed) await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache)).catch(() => {});
  }
  const names: Record<string, string> = {};
  for (const point of points) { const name = cache[cell(point.lat, point.lng)]; if (name) names[point.id] = name; }
  return names;
}
