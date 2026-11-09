import JSZip from 'jszip';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { getEvent, getStory, listEvents, listStories } from './api';

const safe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'item';
async function bytes(bucket: 'media' | 'event-media', path: string) {
  if (Platform.OS !== 'web') {
    const signed = await supabase.storage.from(bucket).createSignedUrl(path, 600);
    if (signed.error || !signed.data) throw new Error('Could not download a file. Please try again.');
    const destination = new File(Paths.cache, `ws-export-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    try {
      const downloaded = await File.downloadFileAsync(signed.data.signedUrl, destination);
      return new Uint8Array(await downloaded.arrayBuffer());
    } finally { if (destination.exists) destination.delete(); }
  }
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error('Could not download a file. Check your connection and try again.');
  return new Uint8Array(await data.arrayBuffer());
}
async function saveAndShare(zip: JSZip, name: string) {
  const out = await zip.generateAsync({ type: 'uint8array' });
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([new Uint8Array(out)], { type: 'application/zip' }));
    const link = document.createElement('a');
    link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  await file.write(out);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is unavailable on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', dialogTitle: name });
}

/** Everything you have in Whole Story: stories, photos, recordings and words, plus your event walls. */
export async function exportMyData(onProgress?: (msg: string) => void) {
  const zip = new JSZip();
  const stories = [...(await listStories()), ...(await listStories({ private: true }))];
  let n = 0;
  for (const s of stories) {
    onProgress?.(`Story ${++n} of ${stories.length}`);
    const { entries } = await getStory(s.id);
    const dir = zip.folder(`Stories/${safe(s.title)}-${s.story_date}-${s.id}`)!;
    dir.file('metadata.json', JSON.stringify({ story: s, entries }, null, 2));
    let text = `${s.title}\n${s.story_date}${s.private ? ' (private)' : ''}\n\n`;
    let i = 0;
    for (const e of entries) {
      text += `[${new Date(e.created_at).toLocaleString('en-GB')}] ${e.author_name || 'You'}\n`;
      if (e.text) text += e.text + '\n';
      if (e.transcript) text += `Voice story words: ${e.transcript}\n`;
      for (const p of e.photos) { const b = await bytes('media', p.path); if (b) dir.file(`photo-${++i}.${p.path.split('.').pop()}`, b); }
      if (e.audio_path) { const b = await bytes('media', e.audio_path); if (b) dir.file(`voice-${++i}.${e.audio_path.split('.').pop()}`, b); }
      text += '\n';
    }
    dir.file('story.txt', text);
  }
  const events = await listEvents();
  for (const ev of events) { onProgress?.(`Event: ${ev.name}`); await addEvent(zip.folder(`Event walls/${safe(ev.name)}-${ev.id}`)!, ev.id); }
  await saveAndShare(zip, 'Whole-Story-my-data.zip');
}
async function addEvent(dir: JSZip, eventId: string) {
  const { ev, posts, moments } = await getEvent(eventId);
  dir.file('metadata.json', JSON.stringify({ event: ev, moments, posts }, null, 2));
  if (ev.cover_path) dir.file(`cover.${ev.cover_path.split('.').pop()}`, await bytes('event-media', ev.cover_path));
  let text = `${ev.name}\n\n`, i = 0;
  for (const p of posts.slice().reverse()) {
    text += `[${new Date(p.created_at).toLocaleString('en-GB')}] ${p.author_user ? 'Host' : p.guest_name || 'Guest'}\n${p.text ? p.text + '\n' : ''}\n`;
    for (const ph of p.photos) { const b = await bytes('event-media', ph.path); if (b) dir.file(`photo-${++i}.${ph.path.split('.').pop()}`, b); }
    if (p.audio_path) { const b = await bytes('event-media', p.audio_path); if (b) dir.file(`voice-${++i}.${p.audio_path.split('.').pop()}`, b); }
  }
  dir.file('stories.txt', text);
}
/** One event wall, for the host to keep or send on. */
export async function exportEvent(eventId: string, name: string) {
  const zip = new JSZip();
  await addEvent(zip, eventId);
  await saveAndShare(zip, `${safe(name)}-memories.zip`);
}
