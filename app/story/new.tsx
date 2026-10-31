import { localDate, parseDate } from '@/lib/dates';
import { useState } from 'react';
import { takeHandOff } from '@/lib/handoff';
import { Alert } from '@/lib/alert';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, H1, P, Field, Btn } from '@/components/ui';
import { Composer } from '@/components/media';
import { createStory, emptyDraft, setPeopleInStory, type Draft } from '@/lib/api';

export default function NewStory() {
  const { quick, private: priv, person } = useLocalSearchParams<{ quick?: string; private?: string; person?: string }>();
  const [hand] = useState(() => takeHandOff());
  const today = localDate();
  const [title, setTitle] = useState(hand?.title ?? (quick ? `Today, ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : ''));
  const [draft, setDraft] = useState<Draft>(() => ({ ...emptyDraft(), photos: hand?.photos ?? [] }));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    if (draft.recording || draft.processingAudio) return Alert.alert('Finish your recording first', 'Stop recording and wait for the words before saving.');
    if (!draft.photos.length && !draft.text.trim() && !draft.audioUri) return Alert.alert('Add something first', 'Choose a photo, record your voice or write a few words.');
    setBusy(true);
    const date = (draft.photos.find(p => p.takenAt)?.takenAt ? localDate(parseDate(draft.photos.find(p => p.takenAt)!.takenAt!)) : null) ?? today;
    try { const id = await createStory(title, date, draft, { private: priv === '1' }); if (person) await setPeopleInStory(id, [person]); router.replace(`/story/${id}`); }
    catch (e: any) { Alert.alert('Could not save', e.message ?? 'Please try again.'); }
    finally { setBusy(false); }
  };
  return (
    <Screen>
      <H1>{quick ? 'What made today special?' : priv === '1' ? 'A private story' : 'A new story'}</H1>
      <P muted style={{ marginBottom: 12 }}>{quick ? 'Say it in your own words. It takes a few seconds.' : 'Choose photos, then tell what happened.'}</P>
      <Field label="Story name" value={title} onChangeText={setTitle} placeholder="e.g. Lisbon, May 2024" />
      <Composer draft={draft} setDraft={setDraft} prompt={hand?.prompt} />
      <Btn title="Save story" onPress={save} busy={busy} disabled={!!(draft.recording || draft.processingAudio)} />
    </Screen>
  );
}
