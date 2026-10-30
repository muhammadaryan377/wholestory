import { router } from 'expo-router';
import type { StoredPhoto } from './api';
/** Opens a stored photo full screen. */
export const openPhoto = (p: StoredPhoto, storyId?: string, title?: string) => router.push({ pathname: '/photo', params: {
  id: p.id, path: p.path, story: storyId ?? '', title: title ?? '', caption: p.caption ?? '', lat: p.lat != null ? String(p.lat) : '', lng: p.lng != null ? String(p.lng) : '', taken: p.taken_at ?? '' } });
