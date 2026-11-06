import { localDate, parseDate } from '@/lib/dates';
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/typography';
import { Alert } from '@/lib/alert';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Screen, H1, P, Btn, Field, Card, Small } from '@/components/ui';
import { Composer } from '@/components/media';
import { addToStory, createStory, emptyDraft, type Draft } from '@/lib/api';
import { C, F } from '@/lib/theme';

/** Splits what was said into one part per photo, in order. */
function pinToPhotos(words: string, count: number) {
  const sentences = words.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  if (!count) return [];
  const parts: string[] = Array.from({ length: count }, () => '');
  sentences.forEach((s, i) => { const k = Math.min(count - 1, Math.floor((i * count) / Math.max(1, sentences.length))); parts[k] = (parts[k] + ' ' + s).trim(); });
  return parts;
}

export default function TellTheWholeStory() {
  const { id, title: existingTitle } = useLocalSearchParams<{ id?: string; title?: string }>();
  const [title, setTitle] = useState('');
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [pinned, setPinned] = useState(false); const [busy, setBusy] = useState(false);
  const words = (draft.transcript || draft.text).trim();
  const pin = () => {
    if (draft.recording || draft.processingAudio) return Alert.alert('Finish your recording first', 'Stop recording and wait for the words before continuing.');
    if (draft.photos.length < 2) return Alert.alert('Choose a few photos first', 'Pick the photos from the trip or day, in any order.');
    if (!words) return Alert.alert('Tell the story first', draft.audioUri ? 'We couldn’t turn the recording into words on this phone. Type a few sentences instead.' : 'Record it in your own voice, or type it.');
    const parts = pinToPhotos(words, draft.photos.length);
    setDraft({ ...draft, photos: draft.photos.map((p, i) => ({ ...p, caption: parts[i] })) }); setPinned(true);
  };
  const save = async () => {
    if (busy) return;
    if (draft.recording || draft.processingAudio) return Alert.alert('Finish your recording first', 'Stop recording and wait for the words before saving.');
    setBusy(true);
    try {
      const d = { ...draft };
      if (id) { await addToStory(id, d); router.replace(`/story/${id}`); }
      else { const date = (draft.photos.find(p => p.takenAt)?.takenAt ? localDate(parseDate(draft.photos.find(p => p.takenAt)!.takenAt!)) : null) ?? localDate(); const sid = await createStory(title, date, d); router.replace(`/story/${sid}`); }
    } catch (e: any) { Alert.alert('Could not save', e.message ?? ''); } finally { setBusy(false); }
  };
  if (pinned) return (
    <Screen>
      <H1>Check your story</H1>
      <P muted style={{ marginBottom: 12 }}>Each part of what you said is pinned to a photo, in order. Edit anything before saving.</P>
      {draft.photos.map((p, i) => (
        <Card key={p.uri + i} style={{ flexDirection: 'row', gap: 10 }}>
          <Image source={{ uri: p.uri }} style={{ width: 72, height: 72, borderRadius: 10 }} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Small>Photo {i + 1}</Small>
            <Field multiline value={p.caption ?? ''} placeholder="Nothing for this photo yet" onChangeText={t => setDraft({ ...draft, photos: draft.photos.map((x, j) => (j === i ? { ...x, caption: t } : x)) })} style={{ minHeight: 64 }} />
          </View>
        </Card>
      ))}
      <Btn title={id ? `Save to ${existingTitle ?? 'this story'}` : 'Save story'} onPress={save} busy={busy} disabled={!!(draft.recording || draft.processingAudio)} />
      <Btn kind="link" title="Start again" onPress={() => setPinned(false)} />
    </Screen>
  );
  return (
    <Screen>
      <H1>Tell the whole story</H1>
      <P muted style={{ marginBottom: 12 }}>Choose the photos, then talk through it once. We’ll pin each part to the right photo.</P>
      {!id ? <Field label="Story name" value={title} onChangeText={setTitle} placeholder="e.g. Lisbon, May 2024" /> : <Text style={{ fontFamily: F.serif, fontSize: 18, color: C.navy, marginBottom: 8 }}>Adding to {existingTitle}</Text>}
      <Composer draft={draft} setDraft={setDraft} prompt="Start at the beginning. What happened, and why did it matter?" />
      <Btn title="Pin to photos" onPress={pin} disabled={!!(draft.recording || draft.processingAudio)} />
    </Screen>
  );
}
