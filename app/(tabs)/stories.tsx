import { useFocusResource } from '@/lib/use-focus-resource';
import { parseDate } from '@/lib/dates';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LoadError, Screen, H1, Field, Small, Empty, Loading, Chip } from '@/components/ui';
import { Photo } from '@/components/media';
import { STORY_CATEGORIES, listStoriesWithPreferences, saveStoryPreference, type StoryCategory, type StoryWithPreference } from '@/lib/story-preferences';
import { useAuth } from '@/lib/auth';
import { C, F } from '@/lib/theme';

type Filter = 'All' | StoryCategory;
const FILTERS: Filter[] = ['All', ...STORY_CATEGORIES];
const monthKey = (date: string) => parseDate(date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export default function Stories() {
  const { data: stories, error, reload } = useFocusResource(listStoriesWithPreferences);
  const { session } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Filter>('All');
  const [calendar, setCalendar] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [pickerId, setPickerId] = useState<string | null>(null);

  const changeCategory = async (story: StoryWithPreference, next: StoryCategory) => {
    const userId = session?.user.id;
    if (!userId || editing) return;
    setEditing(story.id);
    try { await saveStoryPreference(userId, story.id, { category: next }); await reload(); setPickerId(null); }
    catch (e) { Alert.alert('Could not save category', e instanceof Error ? e.message : 'Please try again.'); }
    finally { setEditing(null); }
  };

  const chooseCategory = (story: StoryWithPreference) => setPickerId(current => current === story.id ? null : story.id);

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!stories) return <Loading />;

  const query = search.trim().toLowerCase();
  const shown = stories.filter(s =>
    (category === 'All' || s.category === category) &&
    (!query || (s.searchText ?? s.title).toLowerCase().includes(query) ||
      (s.category ?? '').toLowerCase().includes(query) ||
      monthKey(s.story_date).toLowerCase().includes(query))
  );
  const sections = new Map<string, StoryWithPreference[]>();
  shown.forEach(story => {
    const month = monthKey(story.story_date);
    sections.set(month, [...(sections.get(month) ?? []), story]);
  });

  const storyCard = (story: StoryWithPreference) => <View key={story.id} style={styles.storyRow}>
    <Pressable accessibilityRole="button" accessibilityLabel={'Open story ' + story.title}
      onPress={() => router.push(`/story/${story.id}`)} style={styles.storyContent}>
      {story.cover ? <Photo path={story.cover} size={76} style={styles.thumbnail} /> : <View style={[styles.thumbnail, { backgroundColor: C.greenSoft }]} />}
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={styles.storyTitle} numberOfLines={2}>{story.title}</Text>
        <Small>{story.entryCount ?? 0} {(story.entryCount ?? 0) === 1 ? 'moment' : 'moments'} · {monthKey(story.story_date)}</Small>
        <Text style={styles.categoryText}>{story.category ?? 'Choose category'}</Text>
      </View>
      <Text style={styles.arrow}>›</Text>
    </Pressable>
    <Pressable disabled={!!editing} onPress={() => chooseCategory(story)} accessibilityRole="button"
      accessibilityLabel={'Change category for ' + story.title}
      style={styles.editButton}><Text style={styles.editText}>Edit category</Text></Pressable>
    {pickerId === story.id ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, paddingBottom: 4 }}>
      {STORY_CATEGORIES.map(t => <Chip key={t} label={t} on={story.category === t} onPress={() => { void changeCategory(story, t); }} />)}
    </View> : null}
  </View>;

  return <Screen>
    <View style={styles.titleRow}>
      <View><Small>Your life, in stories</Small><H1>Stories</H1></View>
      <Pressable onPress={() => router.push('/(tabs)/settings')} accessibilityLabel="Settings"><Text style={{ color: C.green, fontSize: 24 }}>⚙</Text></Pressable>
    </View>
    <Field placeholder="Search by story, place or keyword…" value={search} onChangeText={setSearch} returnKeyType="search" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
      <Chip label="List" on={!calendar} onPress={() => setCalendar(false)} />
      <Chip label="Map" onPress={() => router.push('/map')} />
      <Chip label="People" onPress={() => router.push('/people')} />
      <Chip label="Calendar" on={calendar} onPress={() => setCalendar(true)} />
    </ScrollView>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
      {FILTERS.map(f => <Chip key={f} label={f} on={category === f} onPress={() => setCategory(f)} />)}
    </ScrollView>
    <View style={styles.dividerRow}>
      <Text style={styles.sectionTitle}>{calendar ? 'Stories by month' : 'Story threads'}</Text>
      <Pressable onPress={() => router.push('/favourites')}><Text style={styles.filterLink}>♥ Favourites ›</Text></Pressable>
    </View>
    <Small style={{ marginBottom: 10 }}>Categories are chosen by you, never guessed from your photos.</Small>
    {!stories.length ? <Empty title="No stories yet" body="A story can be one photo or a whole trip." action="Start a story" onAction={() => router.push('/story/new')} /> : null}
    {stories.length > 0 && !shown.length ? <View style={styles.empty}>
      <Text style={styles.storyTitle}>No matching stories</Text>
      <Small>Choose All or change a story’s category using Edit category.</Small>
    </View> : null}
    {calendar ?
      [...sections.entries()].map(([month, list]) => <View key={month} style={{ marginTop: 8 }}>
        <Text style={styles.month}>{month}</Text>
        {list.map(storyCard)}
      </View>) :
      shown.map(storyCard)}
    <View style={{ marginTop: 12 }}>
      <Chip label="🔒 Private stories" onPress={() => router.push('/private')} />
      <Chip label="Suggested moments" onPress={() => router.push('/suggestions')} />
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dividerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontFamily: F.serif, fontSize: 21, color: C.navy },
  filterLink: { color: C.green, fontFamily: F.sansMedium, fontSize: 13 },
  storyRow: { borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 10 },
  storyContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumbnail: { width: 76, height: 76, borderRadius: 12 },
  storyTitle: { fontFamily: F.serif, fontSize: 18, color: C.navy },
  categoryText: { fontFamily: F.sansMedium, color: C.green, fontSize: 11, marginTop: 6 },
  arrow: { fontSize: 26, color: C.grey },
  editButton: { alignSelf: 'flex-end', marginTop: -6, paddingHorizontal: 8, paddingVertical: 5 },
  editText: { color: C.green, fontSize: 12, fontFamily: F.sansMedium },
  month: { fontFamily: F.serif, fontSize: 19, marginBottom: 8, color: C.navy },
  empty: { borderRadius: 14, padding: 18, backgroundColor: C.card },
});
