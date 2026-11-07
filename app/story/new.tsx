import { localDate, parseDate } from '@/lib/dates';
import { useState } from 'react';
import { View, Text } from 'react-native';
import { takeHandOff } from '@/lib/handoff';
import { Alert } from '@/lib/alert';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, H1, P, Field, Btn, Chip } from '@/components/ui';
import { Composer } from '@/components/media';
import { StoryLocationPicker } from '@/components/story-location';
import { createStory, emptyDraft, setPeopleInStory, type Draft } from '@/lib/api';
import { STORY_CATEGORIES, saveStoryPreference, type StoryCategory, type StoryLocation } from '@/lib/story-preferences';
import { useAuth } from '@/lib/auth';
import { C, F } from '@/lib/theme';

export default function NewStory() {
  const { quick, private: priv, person } = useLocalSearchParams<{ quick?: string; private?: string; person?: string }>();
  const { session } = useAuth();
  const [hand] = useState(() => takeHandOff());
  const today = localDate();
  const [title, setTitle] = useState(hand?.title ?? (quick ? `Today, ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : ''));
  const [draft, setDraft] = useState<Draft>(() => ({ ...emptyDraft(), photos: hand?.photos ?? [] }));
  const [category, setCategory] = useState<StoryCategory | null>(null);
  const [location, setLocation] = useState<StoryLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    if (draft.recording || draft.processingAudio) return Alert.alert('Finish your recording first', 'Stop recording and wait for the words before saving.');
    if (!draft.photos.length && !draft.text.trim() && !draft.audioUri) return Alert.alert('Add something first', 'Choose a photo, record your voice or write a few words.');
    setBusy(true);
    const date = (draft.photos.find(p => p.takenAt)?.takenAt ? localDate(parseDate(draft.photos.find(p => p.takenAt)!.takenAt!)) : null) ?? today;
    try {
      // Preserve the photo's original GPS. A selected story place is stored separately.
      const id = await createStory(title, date, draft, { private: priv === '1' });
      if (person) await setPeopleInStory(id, [person]);
      if (session?.user.id && (category || location)) {
        await saveStoryPreference(session.user.id, id, {
          ...(category ? { category } : {}), ...(location ? { location } : {}),
        }).catch(() => Alert.alert('Story created', 'Category or location could not be saved on this device.'));
      }
      router.replace(`/story/${id}`);
    } catch (e: any) { Alert.alert('Could not save', e.message ?? 'Please try again.'); }
    finally { setBusy(false); }
  };
  return <Screen>
    <H1>{quick ? 'What made today special?' : priv === '1' ? 'A private story' : 'A new story'}</H1>
    <P muted style={{ marginBottom: 12 }}>{quick ? 'Say it in your own words. It takes a few seconds.' : 'Choose photos, then tell what happened.'}</P>
    <Field label="Story name" value={title} onChangeText={setTitle} placeholder="e.g. Lisbon, May 2024" />
    <Composer draft={draft} setDraft={setDraft} prompt={hand?.prompt} />
    <View style={{ marginTop: 14 }}>
      <Text style={{ fontFamily: F.sansBold, color: C.navy, marginBottom: 9 }}>Story category (optional)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {STORY_CATEGORIES.map(t => <Chip key={t} label={t} on={category === t} onPress={() => setCategory(category === t ? null : t)} />)}
      </View>
    </View>
    {priv !== '1' ? <StoryLocationPicker value={location} onChange={setLocation} disabled={busy} /> : null}
    <Btn title="Save story" onPress={save} busy={busy} disabled={!!(draft.recording || draft.processingAudio)} />
  </Screen>;
}
