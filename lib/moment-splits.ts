import type { Entry, Picked, StoredPhoto } from '@/lib/api';

export type StoryMoment = {
  id: string;
  title: string;
  place: string | null;
  dateIso: string;
  dateLabel: string;
  coverPath: string | null;
  photos: StoredPhoto[];
  entries: Entry[];
  storyCount: number;
};

export type PickedMomentGroup = {
  key: string;
  label: string;
  place: string | null;
  dateLabel: string;
  photos: Picked[];
};

const formatDate = (iso: string) => {
  const parsed = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : iso;
};

const firstWords = (text?: string | null) => {
  const cleaned = text?.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return cleaned.length > 38 ? `${cleaned.slice(0, 36)}…` : cleaned;
};

/**
 * Splits a story's entries and photos into moments automatically grouped by
 * resolved place (e.g. Mumbai, Delhi) and capture date so multi-stop trips
 * split cleanly even when uploaded in a single batch.
 */
export function splitStoryMoments(
  entries: Entry[],
  photoPlaces: Record<string, string>,
  fallbackTitle = 'Story moment',
): StoryMoment[] {
  const buckets = new Map<string, {
    id: string;
    place: string | null;
    dateIso: string;
    photos: StoredPhoto[];
    entries: Entry[];
    entrySet: Set<string>;
  }>();

  for (const entry of entries) {
    const entryDay = entry.created_at.slice(0, 10);

    if (!entry.photos.length) {
      const key = `entry:${entry.id}`;
      buckets.set(key, {
        id: key,
        place: null,
        dateIso: entryDay,
        photos: [],
        entries: [entry],
        entrySet: new Set([entry.id]),
      });
      continue;
    }

    for (const photo of entry.photos) {
      const place = photoPlaces[photo.id]?.trim() || null;
      const dayIso = photo.taken_at ? photo.taken_at.slice(0, 10) : entryDay;
      const key = place ? `place:${place.toLowerCase()}::${dayIso}` : `date:${dayIso}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          id: key,
          place,
          dateIso: dayIso,
          photos: [],
          entries: [],
          entrySet: new Set(),
        };
        buckets.set(key, bucket);
      }
      bucket.photos.push(photo);
      if (!bucket.entrySet.has(entry.id)) {
        bucket.entrySet.add(entry.id);
        bucket.entries.push(entry);
      }
    }
  }

  return [...buckets.values()]
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso))
    .map((bucket, idx) => {
      const firstNote = bucket.entries.map(e => firstWords(e.text ?? e.transcript)).find(Boolean);
      const hasVoice = bucket.entries.some(e => !!e.audio_path);
      const storyCount = bucket.entries.filter(e => !!e.audio_path || !!e.text?.trim()).length;
      const captionTitle = bucket.photos.map(p => firstWords(p.caption)).find(Boolean);
      const title = bucket.place
        || captionTitle
        || firstNote
        || (hasVoice && !bucket.photos.length ? 'Voice story' : fallbackTitle || `Moment ${idx + 1}`);
      return {
        id: bucket.id,
        title,
        place: bucket.place,
        dateIso: bucket.dateIso,
        dateLabel: formatDate(bucket.dateIso),
        coverPath: bucket.photos[0]?.path ?? null,
        photos: bucket.photos,
        entries: bucket.entries,
        storyCount,
      };
    });
}

/**
 * Organises newly picked photos into place + date groups before upload
 * (e.g. "Mumbai · 2 Aug 2026", "Delhi · 4 Aug 2026").
 */
export function groupPickedByPlaceAndDay(photos: Picked[], photoPlaces: Record<string, string>): PickedMomentGroup[] {
  const buckets = new Map<string, PickedMomentGroup>();
  photos.forEach((photo, index) => {
    const place = photoPlaces[`picked:${index}`]?.trim() || null;
    const dayIso = photo.takenAt ? photo.takenAt.slice(0, 10) : '';
    const dateLabel = dayIso ? formatDate(dayIso) : 'Selected photos';
    const key = place ? `${place.toLowerCase()}::${dayIso || 'nodate'}` : `date::${dayIso || 'none'}`;
    const label = place ? (dayIso ? `${place} · ${dateLabel}` : place) : dateLabel;
    const existing = buckets.get(key);
    if (existing) existing.photos.push(photo);
    else buckets.set(key, { key, label, place, dateLabel, photos: [photo] });
  });
  return [...buckets.values()];
}
