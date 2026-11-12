import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

const CACHE_KEY = 'ws_place_names_v1';
const DETAILS_CACHE_KEY = 'ws_place_details_v1';
/** Geocoding is slow and rate limited, so each load looks up up to 24 unique areas. */
const MAX_LOOKUPS = 24;
const cell = (lat: number, lng: number) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

export type PlacePoint = { id: string; lat: number; lng: number };
export type PlaceDetail = { label: string; country?: string };

async function readCache<T>(key: string): Promise<Record<string, T>> {
  try {
    const raw: unknown = JSON.parse((await AsyncStorage.getItem(key)) ?? '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, T> : {};
  } catch { return {}; }
}

/** Resolved town/city and country labels for coordinates, keyed by point id. */
export async function placeDetails(points: PlacePoint[]): Promise<Record<string, PlaceDetail>> {
  if (!points.length) return {};
  const [detailsCache, legacyNames] = await Promise.all([
    readCache<PlaceDetail>(DETAILS_CACHE_KEY),
    readCache<string>(CACHE_KEY),
  ]);
  // Android refuses to geocode without location permission, and labels are not worth asking for it.
  const canLookUp = Platform.OS === 'ios' ||
    (Platform.OS === 'android' && await Location.getForegroundPermissionsAsync().then(p => p.granted).catch(() => false));
  if (canLookUp) {
    const missing = [...new Set(points.map(p => cell(p.lat, p.lng)).filter(key => !detailsCache[key]))].slice(0, MAX_LOOKUPS);
    let changed = false;
    for (const key of missing) {
      const [latitude, longitude] = key.split(',').map(Number);
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
        const label = place?.city ?? place?.subregion ?? place?.region ?? place?.country;
        const country = place?.country ?? undefined;
        if (label) {
          detailsCache[key] = { label, ...(country ? { country } : {}) };
          legacyNames[key] = label;
          changed = true;
        }
      } catch { break; }
    }
    if (changed) {
      await Promise.all([
        AsyncStorage.setItem(DETAILS_CACHE_KEY, JSON.stringify(detailsCache)).catch(() => {}),
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(legacyNames)).catch(() => {}),
      ]);
    }
  }
  const out: Record<string, PlaceDetail> = {};
  for (const point of points) {
    const key = cell(point.lat, point.lng);
    const detail = detailsCache[key];
    if (detail) out[point.id] = detail;
    else if (legacyNames[key]) out[point.id] = { label: legacyNames[key] };
  }
  return out;
}

/** Town names for coordinates, keyed by point id. Points without a known name are left out. */
export async function placeNames(points: PlacePoint[]): Promise<Record<string, string>> {
  const details = await placeDetails(points);
  const names: Record<string, string> = {};
  for (const [id, detail] of Object.entries(details)) names[id] = detail.label;
  return names;
}
