import { parseDate } from '@/lib/dates';
import { useCallback, useState } from 'react';
import { View, Text, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { H2, P, Small, Empty, Btn, runAction } from '@/components/ui';
import { Photo } from '@/components/media';
import { BrandHeader, Scrim } from '@/components/story-chrome';
import { Icon } from '@/components/icon';
import { getGrowthSeen, listStoriesWithPreferences, markGrowthSeen, type StoryWithPreference } from '@/lib/story-preferences';
import { memoryFilter, myName, type Story } from '@/lib/api';
import { findSuggestions, libraryAllowed, toPicked, type Suggestion } from '@/lib/suggest';
import { getPrefs, scheduleLocal } from '@/lib/notify';
import { handOff } from '@/lib/handoff';
import { findStoryGrowth, memoryDate, plural } from '@/lib/story-display';
import { useAuth } from '@/lib/auth';
import { Image } from 'expo-image';
import { C, F, S } from '@/lib/theme';

const CARD_GAP = 10;
const greeting = () => { const hour = new Date().getHours(); return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'; };
const memoriesOf = (story: Story) => plural(story.entryCount ?? 0, 'memory', 'memories');
const anniversary = (date: string) => {
  const today = new Date();
  const d = parseDate(date);
  return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() < today.getFullYear();
};

function SectionHeading({ title, onPress }: { title: string; onPress: () => void }) {
  return <View style={styles.sectionHeading}>
    <H2 style={{ marginBottom: 0 }}>{title}</H2>
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={'See all: ' + title} hitSlop={8} style={styles.seeAll}>
      <Text style={styles.seeAllText}>See all</Text><Icon name="forward" size={16} color={C.green} />
    </Pressable>
  </View>;
}

function MemoryCard({ story, width, detail }: { story: StoryWithPreference; width: number; detail: string }) {
  const height = Math.round(width * 0.78);
  return <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + story.title} onPress={() => router.push(`/story/${story.id}`)} style={{ width }}>
    {story.cover ? <Photo path={story.cover} size={width} style={{ width, height, borderRadius: 13 }} /> : <View style={[styles.placeholder, { width, height }]} />}
    <Text style={styles.cardTitle} numberOfLines={1}>{story.title}</Text>
    <View style={styles.cardDetail}><Icon name="image" size={13} color={C.grey} /><Text style={styles.cardDetailText} numberOfLines={2}>{detail}</Text></View>
  </Pressable>;
}

export default function Today() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { width } = useWindowDimensions();
  const [name, setName] = useState('');
  const [stories, setStories] = useState<StoryWithPreference[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [keep, setKeep] = useState<((story: Story) => boolean) | null>(null);
  const [seen, setSeen] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [savedName, allStories, filter, pref, seenAt] = await Promise.all([
        myName(), listStoriesWithPreferences(), memoryFilter(), getPrefs(), userId ? getGrowthSeen(userId) : Promise.resolve({}),
      ]);
      setName(savedName);
      setStories(allStories); setKeep(() => filter); setSeen(seenAt);
      const canRead = await libraryAllowed();
      setAllowed(canRead);
      // Suggestions are a bonus: a photo library problem must not look like the stories failed.
      setSuggestions(canRead ? await findSuggestions(6).catch(() => []) : []);
      scheduleLocal(allStories.filter(filter), pref).catch(() => {});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load your memories.');
    } finally { setBusy(false); }
  }, [userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const tell = async (s: Suggestion) => {
    handOff({ photos: await toPicked(s.assets), title: s.title, prompt: 'What do you remember most about this?' });
    router.push('/story/new');
  };

  const visible = (stories ?? []).filter(s => keep ? keep(s) : !s.hidden_from_memories);
  const featured = visible.find(s => !!s.cover);
  const memories = visible.filter(s => anniversary(s.story_date)).slice(0, 8);
  const recent = visible.slice(0, 8);
  const growth = userId ? findStoryGrowth(visible, userId, seen) : null;
  const cardWidth = Math.floor((width - S.pad * 2 - CARD_GAP * 2) / 3);
  const seeStories = () => router.navigate('/(tabs)/stories');
  const openGrowth = async () => {
    if (!growth || !userId) return;
    await markGrowthSeen(userId, growth.story.id, growth.latest);
    setSeen(current => ({ ...current, [growth.story.id]: growth.latest }));
    router.push(`/story/${growth.story.id}`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.cream }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: S.pad, paddingTop: 8, paddingBottom: 28 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
        <BrandHeader />
        <Text style={styles.greeting} accessibilityRole="header">{greeting()}{name ? ', ' + name.split(' ')[0] : ''}</Text>
        <Text style={styles.tagline}>A few ideas. More memories to discover.</Text>
        {error ? <View style={styles.softCard}><P accessibilityRole="alert">{error}</P><Btn title="Try again" onPress={load} /></View> : null}

        {featured?.cover ? <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + featured.title} onPress={() => router.push(`/story/${featured.id}`)} style={styles.hero}>
          <Photo path={featured.cover} size={320} style={styles.heroPhoto} />
          <Scrim />
          <View style={styles.heroText}>
            <Text style={styles.heroTitle} numberOfLines={2}>{featured.title}</Text>
            <View style={styles.heroSub}><Icon name="image" size={15} color="#FFF" /><Text style={styles.heroSubText}>{memoriesOf(featured)} · Still growing</Text></View>
          </View>
          <View style={styles.heroArrow}><Icon name="forward" size={20} color={C.navy} /></View>
        </Pressable> : <Pressable onPress={() => router.push('/story/new')} style={styles.softCard}>
          <Text style={styles.subheading}>Your first story starts here</Text>
          <Small>Choose a photo, and add the story behind it.</Small>
        </Pressable>}

        <SectionHeading title="This day last year" onPress={seeStories} />
        {memories.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontal} contentContainerStyle={styles.row}>
          {memories.map(s => <MemoryCard key={s.id} story={s} width={cardWidth} detail={`${memoriesOf(s)} · ${memoryDate(s.story_date)}`} />)}
        </ScrollView> : <View style={styles.softCard}><Small>No anniversaries today. Your saved stories will appear here on their special dates.</Small></View>}

        {growth ? <Pressable accessibilityRole="button" onPress={() => runAction(openGrowth)} style={styles.growth}>
          <Icon name="people" size={30} color={C.green} />
          <View style={{ flex: 1 }}>
            <Text style={styles.subheading}>Your story has grown</Text>
            <View style={styles.growthRow}>
              <Small style={{ color: C.ink, flex: 1 }}>{growth.message}</Small>
              <View style={styles.seeAll}><Text style={styles.seeNew}>See what’s new</Text><Icon name="forward" size={15} color={C.green} /></View>
            </View>
          </View>
        </Pressable> : null}

        <SectionHeading title="Continue your story" onPress={seeStories} />
        {recent.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontal} contentContainerStyle={styles.row}>
          {recent.map(s => <MemoryCard key={s.id} story={s} width={cardWidth} detail={memoriesOf(s)} />)}
        </ScrollView> : !error ? <Empty title="Your stories start here" body="Add a few photos, voice notes or words to begin." action="Create a story" onAction={() => router.push('/story/new')} /> : null}

        <Pressable accessibilityRole="button" style={styles.voiceCard} onPress={() => router.push({ pathname: '/story/new', params: { quick: '1' } })}>
          <View style={styles.micCircle}><Icon name="mic" size={24} color="#D2382B" /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.subheading, { marginBottom: 1 }]}>What made today special?</Text>
            <Text style={styles.voiceSub}>Capture a quick voice story</Text>
          </View>
          <Icon name="forward" size={22} color={C.navy} />
        </Pressable>

        {allowed && suggestions.length ? <>
          <SectionHeading title="Moments waiting to be told" onPress={() => router.push('/suggestions')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontal} contentContainerStyle={styles.row}>
            {suggestions.slice(0, 5).map(s => <Pressable key={s.id} onPress={() => runAction(() => tell(s))} style={{ width: cardWidth }}>
              <Image source={{ uri: s.assets[0].uri }} style={{ width: cardWidth, height: Math.round(cardWidth * 0.78), borderRadius: 13 }} contentFit="cover" />
              <Text style={styles.cardTitle} numberOfLines={2}>{s.title}</Text>
              <Small>{s.sub}</Small>
            </Pressable>)}
          </ScrollView>
        </> : null}
        {allowed === false ? <Pressable style={styles.softCard} onPress={() => router.push('/suggestions')}>
          <Text style={styles.subheading}>Find moments in your photos</Text>
          <Small>Choose photo access to get private, on-device suggestions.</Small>
        </Pressable> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  greeting: { fontFamily: F.serif, fontSize: 31, color: C.navy, letterSpacing: -0.4 },
  tagline: { fontFamily: F.sans, fontSize: 14, color: C.ink, marginBottom: 10 },
  hero: { borderRadius: 16, overflow: 'hidden', height: 170, backgroundColor: '#E9DED2' },
  heroPhoto: { width: '100%', height: 170, borderRadius: 0 },
  heroText: { position: 'absolute', left: 14, right: 56, bottom: 12 },
  heroTitle: { color: '#FFF', fontFamily: F.serif, fontSize: 21 },
  heroSub: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  heroSubText: { color: '#FFF', fontFamily: F.sans, fontSize: 13 },
  heroArrow: { position: 'absolute', right: 12, bottom: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { color: C.green, fontFamily: F.sansMedium, fontSize: 13 },
  seeNew: { color: C.green, fontFamily: F.sansMedium, fontSize: 12 },
  horizontal: { marginHorizontal: -S.pad },
  row: { paddingHorizontal: S.pad, gap: CARD_GAP },
  placeholder: { backgroundColor: '#E7E0D4', borderRadius: 13 },
  cardTitle: { color: C.navy, fontFamily: F.serif, fontSize: 15, marginTop: 5 },
  cardDetail: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  cardDetailText: { flex: 1, color: C.grey, fontFamily: F.sans, fontSize: 11 },
  softCard: { backgroundColor: '#EFF1E9', padding: 15, borderRadius: 15, marginTop: 8 },
  growth: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#E6EFDF', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 15, marginTop: 14 },
  growthRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voiceCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F9E0DB', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 15, marginTop: 16 },
  micCircle: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#FBEFEB', alignItems: 'center', justifyContent: 'center' },
  voiceSub: { fontFamily: F.sans, fontSize: 13, color: C.ink },
  subheading: { color: C.navy, fontFamily: F.serif, fontSize: 18, marginBottom: 2 },
});
