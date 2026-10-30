import { useCallback, useState } from 'react';
import { Alert, Share, View, Text, Pressable, ActionSheetIOS, Platform, Modal, ScrollView } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import { Screen, H1, Small, Card, Btn, Loading, Empty, Chip, Field, P } from '@/components/ui';
import { Photo, VoicePlayer } from '@/components/media';
import { Comments } from '@/components/comments';
import { openPhoto } from '@/lib/open';
import { addPerson, deleteEntry, deleteStory, getStory, inviteCode, listPeople, me, peopleInStory, setPeopleInStory, updateStory, type Entry, type Person, type Story } from '@/lib/api';
import { C, F, S } from '@/lib/theme';
import { PrivateLockedError, usePrivateUnlocked } from '@/lib/private-access';

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const unlocked = usePrivateUnlocked();
  const [data, setData] = useState<{ story: Story; entries: Entry[] } | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]); const [tagged, setTagged] = useState<string[]>([]); const [tagging, setTagging] = useState(false); const [newName, setNewName] = useState('');
  const load = useCallback(async () => {
    try { setData(await getStory(id)); setUid((await me())?.id ?? null); setPeople(await listPeople()); setTagged(await peopleInStory(id)); }
    catch (e) { setData(null); if (e instanceof PrivateLockedError) router.replace('/private'); else router.back(); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!data) return <Loading />;
  const { story, entries } = data;
  if (story.private && !unlocked) return <Screen><H1>Private story</H1><Btn title="Unlock Private albums" onPress={() => router.replace('/private')} /></Screen>;
  const owner = uid === story.owner;

  const invite = async () => {
    const code = await inviteCode(story.id);
    const link = Linking.createURL(`/join/${code}`);
    await Share.share({ message: `Add your side of "${story.title}" on Wholestory: ${link}` });
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
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: items, destructiveButtonIndex: 4, cancelButtonIndex: 5 }, act);
    else Alert.alert('Story options', '', items.slice(0, 5).map((t, i) => ({ text: t, onPress: () => act(i) })));
  };
  const removeEntry = (e: Entry) => Alert.alert('Delete this?', 'This removes these photos, recording and words from the story.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await deleteEntry(e); load(); } }]);

  return (
    <>
      <Stack.Screen options={{ title: '', headerRight: owner ? () => <Pressable onPress={options} hitSlop={12}><Text style={{ fontSize: 22, color: C.ink }}>⋯</Text></Pressable> : undefined }} />
      <Screen>
        <H1>{story.title}</H1>
        {tagged.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{people.filter(p => tagged.includes(p.id)).map(p => <Chip key={p.id} label={p.name} onPress={() => router.push(`/people/${p.id}`)} />)}</View> : null}
        <Small style={{ marginBottom: 12 }}>{story.private ? '🔒 Private · ' : ''}{entries.length} {entries.length === 1 ? 'moment' : 'moments'} · {new Date(story.story_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}{story.hidden_from_memories ? ' · hidden from memories' : ''}</Small>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn title="Add to this story" onPress={() => router.push({ pathname: '/story/add/[id]', params: { id: story.id, title: story.title } })} style={{ flex: 1 }} />
          <Btn title="Tell it all" kind="outline" onPress={() => router.push({ pathname: '/story/tell', params: { id: story.id, title: story.title } })} style={{ flex: 0.7 }} />
          {owner ? <Btn title="Invite" kind="outline" onPress={invite} style={{ flex: 0.6 }} /> : null}
        </View>
        {!entries.length ? <Empty title="Nothing here yet" body="Add photos, your voice or a few words." /> : null}
        {entries.map(e => (
          <Card key={e.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Small>{e.author === uid ? 'You' : e.author_name || 'Someone'} · {new Date(e.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Small>
              {e.author === uid || owner ? <Pressable onPress={() => removeEntry(e)} hitSlop={10} accessibilityLabel="Delete"><Text style={{ color: C.faint, fontSize: 16 }}>🗑</Text></Pressable> : null}
            </View>
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
