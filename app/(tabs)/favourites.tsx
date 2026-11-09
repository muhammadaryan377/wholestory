import { useFocusResource } from '@/lib/use-focus-resource';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { LoadError, Screen, H1, Small, Empty, Loading, Chip } from '@/components/ui';
import { Photo, VoicePlayer } from '@/components/media';
import { BrandHeader, SearchBar } from '@/components/story-chrome';
import { Icon, type IconName } from '@/components/icon';
import { listFavourites } from '@/lib/api';
import { listStoriesWithPreferences, type StoryWithPreference } from '@/lib/story-preferences';
import { listVoiceFavourites, type VoiceFavourite } from '@/lib/voice-favourites';
import { storyMeta } from '@/lib/story-display';
import { openPhoto } from '@/lib/open';
import { C, F, S } from '@/lib/theme';

const FILTERS = [
  { value: 'All' }, { value: 'Photos', icon: 'image' }, { value: 'Stories', icon: 'stack' }, { value: 'Voice notes', icon: 'mic' }, { value: 'Places', icon: 'pin' },
] as const satisfies readonly { value: string; icon?: IconName }[];
type Filter = typeof FILTERS[number]['value'];
const GAP = 8;

const loadFavourites = async () => {
  const [photos, stories, voices] = await Promise.all([listFavourites(), listStoriesWithPreferences(), listVoiceFavourites()]);
  return { photos, stories: stories.filter(story => story.favourite), voices };
};

export default function Favourites() {
  const { data, error, reload } = useFocusResource(loadFavourites);
  const { width } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const [oldestFirst, setOldestFirst] = useState(false);
  const size = Math.max(78, Math.floor((width - S.pad * 2 - GAP * 2) / 3));

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const query = search.trim().toLowerCase();
  const found = (...values: (string | null | undefined)[]) => !query || values.some(value => value?.toLowerCase().includes(query));
  const ordered = <T,>(list: T[]) => oldestFirst ? [...list].reverse() : list;

  const photos = ordered(data.photos.filter(photo => found(photo.story_title, photo.caption, photo.taken_at)));
  const placed = photos.filter(photo => photo.lat != null && photo.lng != null);
  const stories = ordered(data.stories.filter(story => found(story.title, story.searchText)));
  const voices = ordered(data.voices.filter(voice => found(voice.story_title, voice.transcript)));
  const nothingSaved = !data.photos.length && !data.stories.length && !data.voices.length;

  const grid = filter === 'All' || filter === 'Photos' ? photos : filter === 'Places' ? placed : [];
  // Under All, a story already represented by a hearted photo is not listed twice.
  const storyList = filter === 'Stories' ? stories : filter === 'All' ? stories.filter(story => !photos.some(photo => photo.story_id === story.id)) : [];
  const voiceList = filter === 'All' || filter === 'Voice notes' ? voices : [];
  const empty = !grid.length && !storyList.length && !voiceList.length;

  const storyCard = (story: StoryWithPreference) => <Pressable key={story.id} accessibilityRole="button" accessibilityLabel={'Open ' + story.title} onPress={() => router.push(`/story/${story.id}`)} style={styles.card}>
    {story.cover ? <Photo path={story.cover} size={76} style={{ borderRadius: 13, width: 76, height: 76 }} /> : <View style={{ borderRadius: 13, width: 76, height: 76, backgroundColor: C.greenSoft }} />}
    <View style={{ flex: 1 }}>
      <Text style={styles.heading} numberOfLines={2}>{story.title || 'Untitled story'}</Text>
      <Small>{storyMeta(story)}</Small>
    </View>
    <Icon name="forward" size={22} color={C.green} />
  </Pressable>;

  const voiceCard = (voice: VoiceFavourite) => <View key={voice.id} style={[styles.card, { alignItems: 'stretch', flexDirection: 'column', gap: 0 }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + voice.story_title} onPress={() => router.push(`/story/${voice.story_id}`)}>
      <Text style={styles.heading} numberOfLines={1}>{voice.story_title || 'Untitled story'}</Text>
    </Pressable>
    <VoicePlayer path={voice.audio_path} durationMs={voice.duration_ms} transcript={voice.transcript} />
  </View>;

  return <Screen style={{ paddingTop: 8, paddingBottom: 28 }}>
    <BrandHeader back />
    <H1 style={{ fontSize: 33 }}>Favourites</H1>
    <SearchBar value={search} onChangeText={setSearch} placeholder="Search favourites…" onFilter={() => setOldestFirst(value => !value)} filterOn={oldestFirst} filterLabel={oldestFirst ? 'Show newest first' : 'Show oldest first'} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={{ paddingHorizontal: S.pad }}>
      {FILTERS.map(item => <Chip key={item.value} label={item.value} icon={'icon' in item ? item.icon : undefined} on={filter === item.value} onPress={() => setFilter(item.value)} />)}
    </ScrollView>

    {nothingSaved ? <Empty title="No favourites yet" body="Tap the heart on a photo, or add a story or voice note to Favourites." /> : null}
    {!nothingSaved && empty ? <View style={styles.empty}>
      <Text style={styles.heading}>No matching favourites</Text>
      <Small>{filter === 'Places' ? 'Only photos with a saved location appear here.' : filter === 'Voice notes' ? 'Open a story and add one of its voice notes to Favourites.' : 'Try another search or category.'}</Small>
    </View> : null}

    {grid.length ? <View style={styles.grid}>
      {grid.map(photo => <Pressable key={photo.id} accessibilityRole="button" accessibilityLabel={'Open favourite from ' + photo.story_title} onPress={() => openPhoto(photo, photo.story_id, photo.story_title)} style={{ width: size, height: size, borderRadius: 14, overflow: 'hidden' }}>
        <Photo path={photo.path} size={size} style={{ width: size, height: size, borderRadius: 14 }} />
        <View style={styles.heart}><Text style={styles.heartText}>♥</Text></View>
      </Pressable>)}
    </View> : null}
    {voiceList.length || storyList.length ? <View style={{ gap: 9, marginTop: grid.length ? 14 : 0 }}>
      {voiceList.map(voiceCard)}
      {storyList.map(storyCard)}
    </View> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  bleed: { marginHorizontal: -S.pad, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  heart: { position: 'absolute', right: 5, bottom: 5, borderRadius: 16, backgroundColor: '#EF3B36', borderWidth: 2, borderColor: '#FFF', width: 31, height: 31, alignItems: 'center', justifyContent: 'center' },
  heartText: { color: '#FFF', fontSize: 15, lineHeight: 18 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: C.line, borderRadius: 15, padding: 10, backgroundColor: C.card },
  heading: { fontFamily: F.serif, color: C.navy, fontSize: 18 },
  empty: { backgroundColor: C.card, borderRadius: 14, padding: 18, marginBottom: 15 },
});
