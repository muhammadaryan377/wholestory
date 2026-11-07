import { parseDate } from '@/lib/dates';
import { useCallback, useState } from 'react';
import { View, Text, Pressable, ActionSheetIOS, Platform, Modal, ScrollView } from 'react-native';
import { Alert } from '@/lib/alert';
import { router, useFocusEffect, useLocalSearchParams, Stack } from 'expo-router';
import { shareStoryInvite, copyStoryInvite } from '@/lib/invite-actions';
import { LoadError, Screen, H1, Small, Card, Btn, Loading, Empty, Chip, Field, P, runAction } from '@/components/ui';
import { Photo, VoicePlayer } from '@/components/media';
import { Comments } from '@/components/comments';
import { openPhoto } from '@/lib/open';
import { addPerson, deleteEntry, deleteStory, getStory, inviteCode, listPeople, me, peopleInStory, setPeopleInStory, updateStory, type Entry, type Person, type Story } from '@/lib/api';
import { C, F, S } from '@/lib/theme';
import { PrivateLockedError, usePrivateUnlocked } from '@/lib/private-access';

export default function StoryScreen() {
  const [loadError, setLoadError] = useState('');
  const { id } = useLocalSearchParams<{ id: string }>();
  const unlocked = usePrivateUnlocked();
  const [data, setData] = useState<{ story: Story; entries: Entry[] } | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]); const [tagged, setTagged] = useState<string[]>([]); const [tagging, setTagging] = useState(false); const [newName, setNewName] = useState('');
  const [confirmingEntryId, setConfirmingEntryId] = useState<string | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [entryDeleteError, setEntryDeleteError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setLoadError(''); setData(await getStory(id)); setUid((await me())?.id ?? null); setPeople(await listPeople()); setTagged(await peopleInStory(id)); }
    catch (e) { if (e instanceof PrivateLockedError) router.replace('/private'); else setLoadError(e instanceof Error ? e.message : 'Could not load this story.'); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (loadError) return <LoadError error={loadError} onRetry={load} />;
  if (!data) return <Loading />;
  const { story, entries } = data;
  if (story.private && !unlocked) return <Screen><H1>Private story</H1><Btn title="Unlock Private albums" onPress={() => router.replace('/private')} /></Screen>;
  const owner = uid === story.owner;

  const invite = async () => {
    const code = await inviteCode(story.id);
    await shareStoryInvite(story.title, code);
  };
  const copyInvite = async () => {
    const code = await inviteCode(story.id);
    await copyStoryInvite(code);
    Alert.alert('Link copied', 'You can paste this invitation into any messaging app.');
  };
  const options = () => {
    const items = ['Who’s in this story?', story.hidden_from_memories ? 'Show in memories again' : 'Hide from memories', story.private ? 'Move out of Private' : 'Move to Private', 'Rename', 'Delete story', 'Cancel'];
    const act = async (i: number) => {
      if (i === 0) setTagging(true);
      if (i === 1) { await updateStory(story.id, { hidden_from_memories: !story.hidden_from_memories }); load(); }
      if (i === 2) { await updateStory(story.id, { private: !story.private }); Alert.alert(story.private ? 'Moved out of Private' : 'Moved to Private', story.private ? 'It now appears in Stories again.' : 'Only you can see it, behind your passcode.'); load(); }
      if (i === 3) Alert.prompt?.('Rename story', '', async t => { if (t?.trim()) { await updateStory(story.id, { title: t.trim() }); load(); } }, 'plain-text', story.title);
      if (i === 4) Alert.alert('Delete this story?', 'Its photos, recordings and words will be removed from Wholestory. Your originals stay on your phone.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await deleteStory(story.id); router.back(); } }]);
    };
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: items, destructiveButtonIndex: 4, cancelButtonIndex: 5 }, i => runAction(() => act(i)));
    else Alert.alert('Story options', '', items.slice(0, 5).map((t, i) => ({ text: t, onPress: () => act(i) })));
  };
  const removeEntry = async (e: Entry) => {
    if (deletingEntryId) return;
    setDeletingEntryId(e.id);
    setEntryDeleteError(null);
    try {
      await deleteEntry(e);
      setConfirmingEntryId(null);
      await load();
    } catch (error: any) {
      setEntryDeleteError(error?.message ?? 'Could not delete this moment.');
    } finally {
      setDeletingEntryId(null);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: '', headerRight: owner ? () => <Pressable onPress={options} hitSlop={12}><Text style={{ fontSize: 22, color: C.ink }}>⋯</Text></Pressable> : undefined }} />
      <Screen>
        <H1>{story.title}</H1>
        {tagged.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{people.filter(p => tagged.includes(p.id)).map(p => <Chip key={p.id} label={p.name} onPress={() => router.push(`/people/${p.id}`)} />)}</View> : null}
        <Small style={{ marginBottom: 12 }}>{story.private ? '🔒 Private · ' : ''}{entries.length} {entries.length === 1 ? 'moment' : 'moments'} · {parseDate(story.story_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}{story.hidden_from_memories ? ' · hidden from memories' : ''}</Small>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn title="Add to this story" onPress={() => router.push({ pathname: '/story/add/[id]', params: { id: story.id, title: story.title } })} style={{ flex: 1 }} />
          <Btn title="Tell it all" kind="outline" onPress={() => router.push({ pathname: '/story/tell', params: { id: story.id, title: story.title } })} style={{ flex: 0.7 }} />
          {owner && !story.private ? <Btn title="Invite" kind="outline" onPress={invite} style={{ flex: 0.6 }} /> : null}
        </View>
        {owner && !story.private ? <Pressable accessibilityRole="button" accessibilityLabel="Copy invitation link" onPress={() => runAction(copyInvite)} style={{ alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 8 }}><Text style={{ color: C.green, fontFamily: F.sansMedium, fontSize: 13 }}>Copy invite link</Text></Pressable> : null}
        {!entries.length ? <Empty title="Nothing here yet" body="Add photos, your voice or a few words." /> : null}
        {entries.map(e => (
          <Card key={e.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Small>{e.author === uid ? 'You' : e.author_name || 'Someone'} · {new Date(e.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Small>
              {e.author === uid || owner ? <Pressable disabled={!!deletingEntryId} onPress={() => { setConfirmingEntryId(e.id); setEntryDeleteError(null); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Delete moment" accessibilityState={{ disabled: !!deletingEntryId }}><Text style={{ color: C.faint, fontSize: 16 }}>🗑</Text></Pressable> : null}
            </View>
            {confirmingEntryId === e.id && (e.author === uid || owner) ? (
              <View style={{ backgroundColor: C.redSoft, borderRadius: 12, padding: 12, marginBottom: 10 }}>
                <P>Delete this moment? This removes its photos, recording and words from the story.</P>
                {entryDeleteError ? <Text accessibilityRole="alert" style={{ color: C.red, marginTop: 8 }}>{entryDeleteError}</Text> : null}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn title="Cancel" kind="outline" disabled={!!deletingEntryId} onPress={() => { setConfirmingEntryId(null); setEntryDeleteError(null); }} style={{ flex: 1 }} />
                  <Btn title="Delete moment" kind="danger" busy={deletingEntryId === e.id} disabled={!!deletingEntryId} onPress={() => removeEntry(e)} style={{ flex: 1 }} />
                </View>
              </View>
            ) : null}
            {e.photos.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{e.photos.map(p => (
              <Pressable key={p.id} onPress={() => openPhoto(p, story.id, story.title)} style={{ width: e.photos.length === 1 || p.caption ? '100%' : undefined }}>
                <Photo path={p.path} size={e.photos.length === 1 || p.caption ? 300 : 96} />
                {p.caption ? <Text style={{ fontFamily: F.serifRegular, fontSize: 15, color: C.ink, marginTop: 4, marginBottom: 6 }}>{p.caption}</Text> : null}
              </Pressable>))}</View> : null}
            {e.text ? <Text style={{ fontFamily: F.serifRegular, fontSize: 17, color: C.ink, marginTop: 8, lineHeight: 24 }}>{e.text}</Text> : null}
            {e.audio_path ? <VoicePlayer path={e.audio_path} durationMs={e.duration_ms} transcript={e.transcript} /> : null}
            <Comments items={e.comments ?? []} target={{ entry_id: e.id }} uid={uid} canModerate={owner} onChange={load} />
          </Card>
        ))}
      </Screen>
      <Modal visible={tagging} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setTagging(false)}>
        <ScrollView style={{ backgroundColor: C.cream }} contentContainerStyle={{ padding: S.pad }} keyboardShouldPersistTaps="handled">
          <H1>Who’s in this story?</H1>
          <P muted style={{ marginBottom: 10 }}>Tap to add or remove. Each person’s page shows your stories together.</P>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{people.map(p => <Chip key={p.id} label={p.name} on={tagged.includes(p.id)} onPress={() => setTagged(tagged.includes(p.id) ? tagged.filter(x => x !== p.id) : [...tagged, p.id])} />)}</View>
          <Field label="Someone new" value={newName} onChangeText={setNewName} placeholder="Their name" />
          <Btn title="Add person" kind="outline" onPress={async () => { if (!newName.trim()) return; const pid = await addPerson(newName); setNewName(''); setPeople(await listPeople()); setTagged([...tagged, pid]); }} />
          <Btn title="Done" onPress={async () => { await setPeopleInStory(story.id, tagged); setTagging(false); load(); }} />
        </ScrollView>
      </Modal>
    </>
  );
}
