import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';
import { privateIsUnlocked, PrivateLockedError } from './private-access';

const extOf = (uri: string, fallback: string) => {
  const m = uri.split('?')[0].match(/\.([a-zA-Z0-9]{2,5})$/);
  return (m ? m[1] : fallback).toLowerCase();
};
const mime = (ext: string) =>
  ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp', m4a: 'audio/mp4', mp4: 'video/mp4', caf: 'audio/x-caf', aac: 'audio/aac', webm: 'audio/webm', ogg: 'audio/ogg' } as Record<string, string>)[ext] ?? 'application/octet-stream';

/** Uploads a local file (photo or recording) and returns its storage path. */
export async function uploadFile(bucket: 'media' | 'event-media' | 'avatars', folder: string, uri: string, fallbackExt = 'jpg') {
  let ext = extOf(uri, fallbackExt);
  if (fallbackExt === 'jpg') {
    const context = ImageManipulator.manipulate(uri);
    const source = await context.renderAsync();
    try {
      const longest = Math.max(source.width, source.height);
      if (longest > 2048) {
        context.resize(source.width >= source.height ? { width: 2048 } : { height: 2048 });
      }
      const image = await context.renderAsync();
      try {
        uri = (await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 })).uri;
        ext = 'jpg';
      } finally { image.release(); }
    } finally { source.release(); context.release(); }
  }
  let body: ArrayBuffer;
  let contentType = mime(ext);
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Could not read the selected file. Please choose it again.');
    const blob = await response.blob();
    if (fallbackExt !== 'jpg' && blob.type) {
      contentType = blob.type;
      if (blob.type.includes('webm')) ext = 'webm';
      else if (blob.type.includes('ogg')) ext = 'ogg';
    }
    body = await blob.arrayBuffer();
  } else body = await new File(uri).arrayBuffer();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert: false });
  if (error) throw error;
  return path;
}

const cache = new Map<string, { url: string; at: number; private: boolean }>();
const CACHE_MS = 50 * 60 * 1000;
export function clearMediaCache() { cache.clear(); }
/** A temporary link to view a private story file. */
export async function viewUrl(path: string) {
  const known = cache.get(path);
  if (known && Date.now() - known.at < CACHE_MS) {
    if (known.private && !privateIsUnlocked()) throw new PrivateLockedError();
    return known.url;
  }
  const photo = await supabase.from('entry_photos').select('entries(stories(private))').eq('path', path).maybeSingle();
  if (photo.error) throw photo.error;
  let story = (photo.data as any)?.entries?.stories;
  if (!photo.data) {
    const audio = await supabase.from('entries').select('stories(private)').eq('audio_path', path).maybeSingle();
    if (audio.error) throw audio.error;
    story = (audio.data as any)?.stories;
  }
  if (!story) return '';
  if (story.private && !privateIsUnlocked()) throw new PrivateLockedError();
  const { data, error } = await supabase.storage.from('media').createSignedUrl(path, 60 * 60);
  if (error || !data) return '';
  cache.set(path, { url: data.signedUrl, at: Date.now(), private: !!story.private });
  return data.signedUrl;
}
export const eventUrl = (path: string) => supabase.storage.from('event-media').getPublicUrl(path).data.publicUrl;
