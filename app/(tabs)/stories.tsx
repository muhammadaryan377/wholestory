import { useFocusResource } from '@/lib/use-focus-resource';
import { parseDate } from '@/lib/dates';
import { useState } from 'react';
import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { LoadError, Screen, H1, Field, Card, Small, Empty, Loading, Chip } from '@/components/ui';
import { Photo } from '@/components/media';
import { listStories } from '@/lib/api';
import { C, F } from '@/lib/theme';

export default function Stories() {
  const { data: stories, error, reload } = useFocusResource(listStories); const [q, setQ] = useState('');

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!stories) return <Loading />;
  const shown = stories.filter(s => !q.trim() || (s.searchText ?? s.title.toLowerCase()).includes(q.trim().toLowerCase()));
  return (
    <Screen>
      <Small>Your life, in stories</Small>
      <H1>Stories</H1>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
        <Chip label="♥ Favourites" onPress={() => router.push('/favourites')} />
        <Chip label="People" onPress={() => router.push('/people')} />
        <Chip label="Map" onPress={() => router.push('/map')} />
        <Chip label="🔒 Private" onPress={() => router.push('/private')} />
        <Chip label="Suggested" onPress={() => router.push('/suggestions')} />
      </View>
      {stories.length ? <Field placeholder="Search your stories" value={q} onChangeText={setQ} /> : null}
      {!stories.length ? <Empty title="No stories yet" body="A story can be one photo or a whole trip. Start with a few photos and your own words." action="Add photos" onAction={() => router.push('/story/new')} /> : null}
      {stories.length && !shown.length ? <Card><Text style={{ fontFamily: F.serif, fontSize: 17, color: C.navy }}>No stories match “{q}”</Text><Small>Try a place, a person or a date.</Small></Card> : null}
      {shown.map(s => (
        <Card key={s.id} onPress={() => router.push(`/story/${s.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {s.cover ? <Photo path={s.cover} size={72} /> : <View style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: '#E9E4D9' }} />}
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.serif, fontSize: 18, color: C.navy }}>{s.title}</Text>
            <Small>{s.entryCount ?? 0} {s.entryCount === 1 ? 'moment' : 'moments'} · {parseDate(s.story_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}{s.hidden_from_memories ? ' · hidden from memories' : ''}</Small>
          </View>
          <Text style={{ color: C.faint, fontSize: 20 }}>›</Text>
        </Card>
      ))}
    </Screen>
  );
}
