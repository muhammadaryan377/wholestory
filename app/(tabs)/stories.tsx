import { useFocusResource } from '@/lib/use-focus-resource';
import { parseDate } from '@/lib/dates';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LoadError, Screen, Small, Empty, Loading, Chip } from '@/components/ui';
import { Photo, StoryCoverPlaceholder } from '@/components/media';
import { BrandHeader, CATEGORY_TAGS, Scrim, SearchBar, Tag } from '@/components/story-chrome';
import { StoryActionsSheet } from '@/components/story-actions';
import { Icon, type IconName } from '@/components/icon';
import { STORY_CATEGORIES, listStoriesWithPreferences, type StoryCategory, type StoryWithPreference } from '@/lib/story-preferences';
import { listPeople, type Person } from '@/lib/api';
import { placeNames } from '@/lib/places';
import { buildThreads, storyMeta } from '@/lib/story-display';
import { useAuth } from '@/lib/auth';
import { C, F, S } from '@/lib/theme';

type Category = 'All' | StoryCategory;
type Kind = 'all' | 'photos' | 'voice';
const CATEGORIES: Category[] = ['All', ...STORY_CATEGORIES];
const CATEGORY_ICONS: Partial<Record<Category, IconName>> = { Travel: 'plane', Events: 'calendar', Family: 'people', Friends: 'people', 'Everyday life': 'heart' };
const MAX_ROW_TAGS = 3;
const monthKey = (date: string) => parseDate(date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const loadStories = async () => {
  const [stories, people] = await Promise.all([listStoriesWithPreferences(), listPeople().catch((): Person[] => [])]);
  return { stories, people };
};

export default function Stories() {
  const { data, error, reload } = useFocusResource(loadStories);
  const { session } = useAuth();
  const { view, at } = useLocalSearchParams<{ view?: string; at?: string }>();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('All');
  const [kind, setKind] = useState<Kind>('all');
  const [calendar, setCalendar] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [places, setPlaces] = useState<Record<string, string>>({});
  const stories = data?.stories;

  // The map's List and Calendar chips land here with a view to open.
  const arrival = view ? `${view}:${at}` : '';
  const [handledArrival, setHandledArrival] = useState('');
  if (arrival && arrival !== handledArrival) { setHandledArrival(arrival); setCalendar(view === 'calendar'); }
  useEffect(() => {
    let active = true;
    placeNames((stories ?? []).flatMap(s => s.lat != null && s.lng != null ? [{ id: s.id, lat: s.lat, lng: s.lng }] : []))
      .then(names => { if (active) setPlaces(names); }).catch(() => {});
    return () => { active = false; };
  }, [stories]);
  const threads = useMemo(() => buildThreads(stories ?? []), [stories]);

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!stories) return <Loading />;

  const nameOf = (id: string) => data?.people.find(p => p.id === id)?.name ?? '';
  const query = search.trim().toLowerCase();
  const matches = (s: StoryWithPreference) => !query || [s.searchText ?? s.title, s.category, monthKey(s.story_date), places[s.id], ...(s.tags ?? []), ...(s.peopleIds ?? []).map(nameOf)]
    .some(value => value?.toLowerCase().includes(query));
  const shown = stories.filter(s =>
    (category === 'All' || s.category === category) &&
    (kind === 'all' || (kind === 'photos' ? (s.photoCount ?? 0) > 0 : (s.voiceCount ?? 0) > 0)) &&
    matches(s));
  const sections = new Map<string, StoryWithPreference[]>();
  shown.forEach(story => {
    const month = monthKey(story.story_date);
    sections.set(month, [...(sections.get(month) ?? []), story]);
  });
  const menuStory = stories.find(s => s.id === menuId);

  const storyRow = (story: StoryWithPreference) => {
    const room = MAX_ROW_TAGS - (story.favourite ? 1 : 0);
    const middle = [...(story.tags ?? []).map(label => ({ label, place: false })), ...(places[story.id] ? [{ label: places[story.id], place: true }] : [])];
    const visible = middle.slice(0, Math.max(0, room - (story.category ? 1 : 0)));
    return <View key={story.id} style={styles.storyRow}>
      <Pressable accessibilityRole="button" accessibilityLabel={'Open story ' + story.title} onPress={() => router.push(`/story/${story.id}`)} style={styles.storyContent}>
        {story.cover ? <Photo path={story.cover} size={78} style={styles.thumbnail} /> : <StoryCoverPlaceholder width={78} height={78} borderRadius={12} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.storyTitle} numberOfLines={1}>{story.title}</Text>
          <Text style={styles.storyMeta} numberOfLines={1}>{storyMeta(story)}</Text>
          <View style={styles.tags}>
            {story.category ? <Tag label={story.category} {...CATEGORY_TAGS[story.category]} /> : <Tag label="Add category" icon="plus" tone="green" onPress={() => setMenuId(story.id)} />}
            {visible.map(tag => tag.place ? <Tag key={tag.label} label={tag.label} icon="pin" tone="blue" /> : <Tag key={tag.label} label={tag.label} icon="tag" tone="green" />)}
            {story.favourite ? <Tag label="Favourite" icon="star" tone="red" /> : null}
          </View>
        </View>
      </Pressable>
      <Pressable onPress={() => setMenuId(story.id)} accessibilityRole="button" accessibilityLabel={'More options for ' + story.title} hitSlop={10} style={styles.more}><Icon name="more" size={24} color={C.navy} /></Pressable>
    </View>;
  };

  return <Screen style={{ paddingTop: 8, paddingBottom: 28 }}>
    <BrandHeader />
    <SearchBar value={search} onChangeText={setSearch} placeholder="Search by moment, place, person or keyword…" onFilter={() => setViewsOpen(open => !open)} filterOn={viewsOpen} filterLabel="Show list, map, people and calendar views" />
    {viewsOpen ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.bleedRow}>
      <Chip label="List" icon="list" on={!calendar} onPress={() => setCalendar(false)} />
      <Chip label="Map" icon="pin" onPress={() => router.navigate('/map')} />
      <Chip label="People" icon="people" onPress={() => router.push('/people')} />
      <Chip label="Calendar" icon="calendar" on={calendar} onPress={() => setCalendar(true)} />
    </ScrollView> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.bleedRow}>
      {CATEGORIES.map(f => <Chip key={f} label={f} icon={CATEGORY_ICONS[f]} on={category === f} onPress={() => setCategory(f)} />)}
    </ScrollView>

    {threads.length ? <>
      <View style={styles.dividerRow}>
        <Text style={styles.sectionTitle}>Story threads</Text>
        <Pressable onPress={() => { setCategory('All'); setKind('all'); setSearch(''); }} accessibilityRole="button" accessibilityLabel="See all stories" hitSlop={8} style={styles.seeAll}>
          <Text style={styles.seeAllText}>See all</Text><Icon name="forward" size={16} color={C.green} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.bleed, { marginBottom: 12 }]} contentContainerStyle={[styles.bleedRow, { gap: 8 }]}>
        {threads.map(thread => <Pressable key={thread.key} accessibilityRole="button" accessibilityLabel={'Show ' + thread.title} onPress={() => setCategory(thread.key)} style={styles.thread}>
          {thread.cover ? <Photo path={thread.cover} size={104} style={styles.threadPhoto} /> : <View style={[styles.threadPhoto, { backgroundColor: C.green }]} />}
          <Scrim start={0.25} />
          <View style={styles.threadText}>
            <Text style={styles.threadTitle} numberOfLines={2}>{thread.title}</Text>
            <Text style={styles.threadSub} numberOfLines={2}>{thread.sub}</Text>
          </View>
        </Pressable>)}
      </ScrollView>
    </> : null}

    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.bleedRow}>
      <Chip label="All stories" on={kind === 'all'} onPress={() => setKind('all')} />
      <Chip label="Favourites" icon="star" onPress={() => router.navigate('/favourites')} />
      <Chip label="Photos" icon="image" on={kind === 'photos'} onPress={() => setKind('photos')} />
      <Chip label="Voice notes" icon="mic" on={kind === 'voice'} onPress={() => setKind('voice')} />
      <Chip label="Private stories" icon="lock" onPress={() => router.push('/private')} />
      <Chip label="Suggested moments" icon="image" onPress={() => router.push('/suggestions')} />
    </ScrollView>

    {!stories.length ? <Empty title="No stories yet" body="A story can be one photo or a whole trip." action="Start a story" onAction={() => router.push('/story/new')} /> : null}
    {stories.length > 0 && !shown.length ? <View style={styles.empty}>
      <Text style={styles.storyTitle}>No matching stories</Text>
      <Small>Try All stories, another category or a different search.</Small>
    </View> : null}
    {calendar ?
      [...sections.entries()].map(([month, list]) => <View key={month} style={{ marginTop: 8 }}>
        <Text style={styles.month}>{month}</Text>
        {list.map(storyRow)}
      </View>) :
      shown.map(storyRow)}
    {menuStory && session?.user.id ? <StoryActionsSheet story={menuStory} userId={session.user.id} onClose={() => setMenuId(null)} onChanged={reload} /> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  bleed: { marginHorizontal: -S.pad, marginBottom: 4 },
  bleedRow: { paddingHorizontal: S.pad },
  dividerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 8 },
  sectionTitle: { fontFamily: F.serif, fontSize: 21, color: C.navy },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { color: C.green, fontFamily: F.sansMedium, fontSize: 13 },
  thread: { width: 104, height: 122, borderRadius: 13, overflow: 'hidden', backgroundColor: '#E9DED2' },
  threadPhoto: { width: 104, height: 122, borderRadius: 0 },
  threadText: { position: 'absolute', left: 8, right: 6, bottom: 7 },
  threadTitle: { color: '#FFF', fontFamily: F.serif, fontSize: 14, lineHeight: 17 },
  threadSub: { color: '#FFF', fontFamily: F.sans, fontSize: 10, lineHeight: 13, marginTop: 1 },
  storyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  storyContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  thumbnail: { width: 78, height: 78, borderRadius: 12 },
  storyTitle: { fontFamily: F.serif, fontSize: 18, color: C.navy },
  storyMeta: { fontFamily: F.sans, fontSize: 12.5, color: C.ink, marginTop: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  more: { paddingLeft: 8, paddingVertical: 8 },
  month: { fontFamily: F.serif, fontSize: 19, marginBottom: 8, color: C.navy },
  empty: { borderRadius: 14, padding: 18, backgroundColor: C.card },
});
