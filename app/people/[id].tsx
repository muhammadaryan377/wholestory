import { parseDate } from '@/lib/dates';
import { useCallback, useState } from 'react';
import { Text, View, Pressable, useWindowDimensions } from 'react-native';
import { Alert } from '@/lib/alert';
import { router, useFocusEffect, useLocalSearchParams, Stack } from 'expo-router';
import { LoadError, Screen, H2, Small, Card, Empty, Loading, Btn, ToggleRow } from '@/components/ui';
import { Photo } from '@/components/media';
import { deletePerson, getPerson, photosInStories, setPersonHidden, type Person, type Story, type StoredPhoto } from '@/lib/api';
import { openPhoto } from '@/lib/open';
import { C, F, S } from '@/lib/theme';

export default function PersonPage() {
  const [loadError, setLoadError] = useState('');
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<{ person: Person & { hidden_from_memories?: boolean }; stories: Story[]; photos: (StoredPhoto & { story_id: string })[] } | null>(null);
  const { width } = useWindowDimensions(); const tile = Math.floor((width - S.pad * 2 - 12) / 3);
  const load = useCallback(async () => {
    try { setLoadError(''); const r = await getPerson(id); setData({ ...r, photos: await photosInStories(r.stories.map(s => s.id), 12) }); } catch (e) { setLoadError(e instanceof Error ? e.message : 'Could not load. Please try again.'); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (loadError) return <LoadError error={loadError} onRetry={load} />;
  if (!data) return <Loading />;
  const { person, stories, photos } = data;
  const since = stories.length ? parseDate(stories[0].story_date) : null;
  const years = since ? new Date().getFullYear() - since.getFullYear() : 0;
  const titleOf = (sid: string) => stories.find(s => s.id === sid)?.title;
  const del = () => Alert.alert(`Remove ${person.name}?`, 'Their page is removed. Your stories stay as they are.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => { await deletePerson(person.id); router.back(); } }]);
  const hero = photos[0];
  return (
    <>
      <Stack.Screen options={{ title: '', headerRight: () => <Pressable onPress={del} hitSlop={12}><Text style={{ color: C.red }}>Remove</Text></Pressable> }} />
      <Screen>
        <View style={{ marginHorizontal: -S.pad, marginTop: -S.pad, marginBottom: 12 }}>
          {hero ? <Photo path={hero.path} size={width} style={{ height: 240, width, borderRadius: 0 }} /> : <View style={{ height: 140, backgroundColor: C.greenSoft }} />}
          <View style={{ position: 'absolute', left: S.pad, bottom: 14 }}>
            <Text style={{ fontFamily: F.serif, fontSize: 38, color: hero ? '#fff' : C.navy, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: hero ? 6 : 0 }}>{person.name}</Text>
            {person.relation || since ? <Text style={{ fontFamily: F.sans, fontSize: 13, color: hero ? '#fff' : C.grey }}>{[person.relation, since ? `Since ${since.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''].filter(Boolean).join(' · ')}</Text> : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingVertical: 10 }}>
          <View style={{ alignItems: 'center' }}><Text style={{ fontFamily: F.serif, fontSize: 22, color: C.navy }}>{stories.reduce((n, s) => n + (s.entryCount ?? 0), 0)}</Text><Small>memories</Small></View>
          <View style={{ alignItems: 'center' }}><Text style={{ fontFamily: F.serif, fontSize: 22, color: C.navy }}>{stories.length}</Text><Small>stories</Small></View>
          <View style={{ alignItems: 'center' }}><Text style={{ fontFamily: F.serif, fontSize: 22, color: C.navy }}>{years > 0 ? `${years} yrs` : '—'}</Text><Small>together</Small></View>
        </View>
        {!stories.length ? <Empty title={`No stories with ${person.name} yet`} body="Open a story, tap ⋯ and choose “Who’s in this story?”." /> : null}
        {stories.length ? <H2>Firsts and milestones</H2> : null}
        {stories.slice(0, 5).map((s, i) => (
          <Card key={s.id} onPress={() => router.push(`/story/${s.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10 }}>
            {s.cover ? <Photo path={s.cover} size={52} /> : <View style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: '#E9E4D9' }} />}
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.serif, fontSize: 16, color: C.navy }}>{i === 0 ? 'First story together: ' : ''}{s.title}</Text>
              <Small>{parseDate(s.story_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Small>
            </View>
            <Text style={{ color: C.faint, fontSize: 18 }}>›</Text>
          </Card>
        ))}
        {photos.length ? <H2 style={{ marginTop: 8 }}>Our memories</H2> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {photos.map(p => <Pressable key={p.id} onPress={() => openPhoto(p, p.story_id, titleOf(p.story_id))}><Photo path={p.path} size={tile} /></Pressable>)}
        </View>
        <Btn title="Add a memory together" onPress={() => router.push({ pathname: '/story/new', params: { person: person.id } })} style={{ marginTop: 14 }} />
        <ToggleRow title="Show in memories and reminders" sub={`Turn off to stop stories with ${person.name} coming back. Nothing is deleted.`} value={!person.hidden_from_memories}
          onChange={async v => { await setPersonHidden(person.id, !v); load(); }} />
      </Screen>
    </>
  );
}
