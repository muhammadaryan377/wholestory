import { useFocusResource } from '@/lib/use-focus-resource';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Stack, router } from 'expo-router';
import { LoadError, Screen, H1, Field, Small, Empty, Loading, Chip, Thread } from '@/components/ui';
import { Photo } from '@/components/media';
import { listFavourites } from '@/lib/api';
import { openPhoto } from '@/lib/open';
import { C, F } from '@/lib/theme';

const FILTERS = ['All', 'Photos', 'Stories', 'Voice notes', 'Places'] as const;
type Filter = typeof FILTERS[number];

export default function Favourites() {
  const { data: items, error, reload } = useFocusResource(listFavourites);
  const { width } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const size = Math.max(78, Math.floor((width - 40 - 12) / 3));

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!items) return <Loading />;
  const query = search.trim().toLowerCase();
  const matches = items.filter(photo => !query ||
    [photo.story_title, photo.caption, photo.taken_at].filter(Boolean).some(v => v!.toLowerCase().includes(query))
  );
  const selected = filter === 'Places' ? matches.filter(photo => photo.lat != null && photo.lng != null) : matches;
  const stories = [...new Map(selected.map(photo => [photo.story_id, photo])).values()];

  return <Screen>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.brandRow}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to Stories" onPress={() => router.back()} style={{ paddingRight: 12 }}><Text style={{ fontSize: 24, color: C.green }}>‹</Text></Pressable>
      <Text style={styles.brand}>Whole Stories</Text><Thread width={90} />
    </View>
    <H1>Favourites</H1>
    <Field placeholder="Search your favourite photos and stories…" value={search} onChangeText={setSearch} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 13 }}>
      {FILTERS.map(value => <Chip key={value} label={value} on={filter === value} onPress={() => setFilter(value)} />)}
    </ScrollView>
    {filter === 'Voice notes' ? <View style={styles.empty}><Text style={styles.heading}>Voice note favourites</Text>
      <Small>Voice notes can be played inside stories. Saving individual voice notes to Favourites isn’t available yet.</Small>
    </View> : null}
    {filter !== 'Voice notes' && !items.length ? <Empty title="No favourites yet" body="Open a story photo and tap the heart to save it here." /> : null}
    {filter !== 'Voice notes' && items.length > 0 && !selected.length ? <View style={styles.empty}>
      <Text style={styles.heading}>No matching favourites</Text>
      <Small>{filter === 'Places' ? 'Only photos with a saved GPS location appear here.' : 'Try another search or category.'}</Small>
    </View> : null}

    {filter === 'Stories' ? <View style={{ gap: 9 }}>
      {stories.map(photo => <Pressable key={photo.story_id} accessibilityRole="button"
        accessibilityLabel={'Open ' + photo.story_title}
        onPress={() => router.push(`/story/${photo.story_id}`)} style={styles.storyCard}>
        <Photo path={photo.path} size={76} style={{ borderRadius: 13, width: 76, height: 76 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.heading} numberOfLines={2}>{photo.story_title || 'Untitled story'}</Text>
          <Small>{matches.filter(p => p.story_id === photo.story_id).length} favourite photos</Small>
        </View><Text style={{ fontSize: 26, color: C.green }}>›</Text>
      </Pressable>)}
    </View> : filter !== 'Voice notes' ? <>
      <Small style={{ marginBottom: 12 }}>{selected.length} {selected.length === 1 ? 'photo' : 'photos'} saved</Small>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {selected.map(photo => <Pressable key={photo.id} accessibilityRole="button"
          accessibilityLabel={'Open favourite from ' + photo.story_title}
          onPress={() => openPhoto(photo, photo.story_id, photo.story_title)}
          style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden' }}>
          <Photo path={photo.path} size={size} style={{ width: size, height: size, borderRadius: 12 }} />
          <View style={styles.heart}><Text style={{ color: '#F04F4D', fontSize: 16 }}>♥</Text></View>
        </Pressable>)}
      </View>
    </> : null}
  </Screen>;
}
const styles = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 17 },
  brand: { fontFamily: F.serif, fontSize: 25, color: C.navy, flex: 1 },
  heart: { position: 'absolute', right: 6, bottom: 5, borderRadius: 16, backgroundColor: '#FFFFFFE8', width: 27, height: 27, alignItems: 'center', justifyContent: 'center' },
  storyCard: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: C.line, borderRadius: 15, padding: 10, backgroundColor: C.card },
  heading: { fontFamily: F.serif, color: C.navy, fontSize: 18 },
  empty: { backgroundColor: C.card, borderRadius: 14, padding: 18, marginBottom: 15 },
});
