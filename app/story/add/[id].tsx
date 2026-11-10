import { useState } from 'react';
import { Alert } from '@/lib/alert';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, H1, P, Btn } from '@/components/ui';
import { Composer } from '@/components/media';
import { addToStory, emptyDraft, type Draft } from '@/lib/api';
import { useUnsavedGuard } from '@/lib/use-unsaved-guard';

export default function AddToStory() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  useUnsavedGuard(!busy && (draft.photos.length > 0 || !!draft.text.trim() || !!draft.audioUri));
  const save = async () => {
    if (busy) return;
    if (draft.recording || draft.processingAudio) return Alert.alert('Finish your recording first', 'Stop recording and wait for the words before saving.');
    if (!draft.photos.length && !draft.text.trim() && !draft.audioUri) return Alert.alert('Add something first', 'Choose a photo, record your voice or write a few words.');
    setBusy(true);
    try { await addToStory(id, draft); router.back(); }
    catch (e: any) { Alert.alert('Could not save', e.message ?? 'Please try again.'); }
    finally { setBusy(false); }
  };
  return (
    <Screen>
      <H1>Add to {title ?? 'this story'}</H1>
      <P muted style={{ marginBottom: 12 }}>New photos, a new chapter, or your side of what happened.</P>
      <Composer draft={draft} setDraft={setDraft} />
      <Btn title="Add to story" onPress={save} busy={busy} disabled={!!(draft.recording || draft.processingAudio)} />
    </Screen>
  );
}
