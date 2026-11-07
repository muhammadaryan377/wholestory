import { parseDate } from '@/lib/dates';
import { useCallback, useState } from 'react';
import { View, Text, Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { H1, H2, P, Small, Thread, Empty, Btn, runAction } from '@/components/ui';
import { Photo } from '@/components/media';
import { listStoriesWithPreferences, type StoryWithPreference } from '@/lib/story-preferences';
import { memoryFilter, myName, type Story } from '@/lib/api';
import { findSuggestions, libraryAllowed, toPicked, type Suggestion } from '@/lib/suggest';
import { getPrefs, scheduleLocal } from '@/lib/notify';
import { handOff } from '@/lib/handoff';
import { chooseLocalProfilePhoto, readLocalProfilePhoto } from '@/lib/profile-photo';
import { useAuth } from '@/lib/auth';
import { Image } from 'expo-image';
import { C, F, S } from '@/lib/theme';
import { Alert } from '@/lib/alert';

const greeting = () => { const hour = new Date().getHours(); return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'; };
const anniversary = (date: string) => {
  const today = new Date();
  const d = parseDate(date);
  return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() < today.getFullYear();
};

export default function Today() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [avatar, setAvatar] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [stories, setStories] = useState<StoryWithPreference[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState('');
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [keep, setKeep] = useState<((story: Story) => boolean) | null>(null);

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [savedName, allStories, filter, pref] = await Promise.all([
        myName(), listStoriesWithPreferences(), memoryFilter(), getPrefs(),
      ]);
      setName(savedName);
      if (userId) setAvatar(await readLocalProfilePhoto(userId).catch(() => null));
      setStories(allStories); setKeep(() => filter);
      const canRead = await libraryAllowed();
      setAllowed(canRead);
      setSuggestions(canRead ? await findSuggestions(6) : []);
      scheduleLocal(allStories.filter(filter), pref).catch(() => {});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load your memories.');
    } finally { setBusy(false); }
  }, [userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const choosePhoto = async () => {
    if (!userId || photoBusy) return;
    setPhotoBusy(true);
    try {
      const uri = await chooseLocalProfilePhoto(userId);
      if (uri) setAvatar(uri + '?v=' + Date.now()); // refresh after replacing cached image
    } catch (e) { Alert.alert('Could not update profile photo', e instanceof Error ? e.message : 'Try again.'); }
    finally { setPhotoBusy(false); }
  };

  const tell = async (s: Suggestion) => {
    handOff({ photos: await toPicked(s.assets), title: s.title, prompt: 'What do you remember most about this?' });
    router.push('/story/new');
  };

  const visible = (stories ?? []).filter(s => keep ? keep(s) : !s.hidden_from_memories);
  const featured = visible.find(s => !!s.cover);
  const memories = visible.filter(s => anniversary(s.story_date)).slice(0, 8);
  const recent = visible.slice(0, 8);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.cream }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: S.pad, paddingBottom: 92 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
        <View style={styles.topBar}>
          <Text style={styles.brand}>Whole Stories</Text>
          <Thread width={94} />
          <Pressable onPress={() => router.push('/(tabs)/settings')} accessibilityRole="button" accessibilityLabel="Open settings" hitSlop={12}><Text style={styles.settings}>⚙</Text></Pressable>
        </View>
        <View style={styles.greeting}>
          <View style={{ flex: 1 }}>
            <H1 style={{ fontSize: 27, marginBottom: 1 }}>{greeting()}{name ? ', ' + name.split(' ')[0] : ''}</H1>
            <P muted style={{ fontSize: 13 }}>A few ideas. More memories to discover.</P>
          </View>
          <Pressable onPress={() => runAction(choosePhoto)} accessibilityRole="button" accessibilityLabel={avatar ? 'Change profile photo' : 'Add profile photo'} disabled={photoBusy} style={styles.avatarButton}>
            {avatar ? <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" /> :
              <Text style={{ fontFamily: F.serif, fontSize: 24, color: C.green }}>{(name[0] ?? '+').toUpperCase()}</Text>}
            <View style={styles.avatarPlus}><Text style={{ color: C.white, fontSize: 11 }}>＋</Text></View>
          </Pressable>
        </View>
        {!avatar ? <Pressable onPress={() => runAction(choosePhoto)} accessibilityRole="button" style={styles.photoPrompt}>
          <Text style={{ color: C.green, fontFamily: F.sansMedium, fontSize: 13 }}>＋ Add your profile photo</Text>
          <Text style={{ color: C.grey, fontFamily: F.sans, fontSize: 12 }}>Make your stories feel more personal</Text>
        </Pressable> : null}
        {error ? <View style={styles.softCard}><P accessibilityRole="alert">{error}</P><Btn title="Try again" onPress={load} /></View> : null}

        {featured?.cover ? <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + featured.title} onPress={() => router.push(`/story/${featured.id}`)} style={styles.hero}>
          <Photo path={featured.cover} size={320} style={styles.heroPhoto} />
          <View style={styles.heroOverlay}>
            <Text style={styles.heroTitle} numberOfLines={2}>{featured.title}</Text>
            <Text style={styles.heroSub}>{featured.entryCount ?? 0} moments · Still growing</Text>
            <Text style={styles.heroArrow}>›</Text>
          </View>
        </Pressable> : <Pressable onPress={() => router.push('/story/new')} style={styles.softCard}>
          <Text style={styles.subheading}>Your first story starts here</Text>
          <Small>Choose a photo, and add the story behind it.</Small>
        </Pressable>}

        <View style={styles.sectionHeading}><H2>This day last year</H2><Pressable onPress={() => router.push('/(tabs)/stories')}><Text style={styles.seeAll}>See all ›</Text></Pressable></View>
        {memories.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontal} contentContainerStyle={{ paddingRight: S.pad }}>
          {memories.map(s => <Pressable key={s.id} onPress={() => router.push(`/story/${s.id}`)} style={styles.thumbnailCard}>
            {s.cover ? <Photo path={s.cover} size={112} style={{ width: 112, height: 93, borderRadius: 12 }} /> :
              <View style={[styles.thumbnailPlaceholder, { width: 112, height: 93 }]} />}
            <Text style={styles.thumbTitle} numberOfLines={1}>{s.title}</Text>
            <Small>{parseDate(s.story_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Small>
          </Pressable>)}
        </ScrollView> : <View style={styles.softCard}><Small>No anniversaries today. Your saved stories will appear here on their special dates.</Small></View>}

        {allowed && suggestions.length ? <>
          <View style={styles.sectionHeading}><H2>Moments waiting to be told</H2><Pressable onPress={() => router.push('/suggestions')}><Text style={styles.seeAll}>See all ›</Text></Pressable></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontal}>
            {suggestions.slice(0, 5).map(s => <Pressable key={s.id} onPress={() => runAction(() => tell(s))} style={styles.thumbnailCard}>
              <Image source={{ uri: s.assets[0].uri }} style={{ width: 112, height: 93, borderRadius: 12 }} contentFit="cover" />
              <Text style={styles.thumbTitle} numberOfLines={2}>{s.title}</Text>
              <Small>{s.sub}</Small>
            </Pressable>)}
          </ScrollView>
        </> : null}
        {allowed === false ? <Pressable style={styles.softCard} onPress={() => router.push('/suggestions')}>
          <Text style={styles.subheading}>Find moments in your photos</Text>
          <Small>Choose photo access to get private, on-device suggestions.</Small>
        </Pressable> : null}

        <View style={styles.sectionHeading}><H2>Continue your story</H2><Pressable onPress={() => router.push('/(tabs)/stories')}><Text style={styles.seeAll}>See all ›</Text></Pressable></View>
        {recent.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontal}>
          {recent.map(s => <Pressable key={s.id} onPress={() => router.push(`/story/${s.id}`)} style={styles.thumbnailCard}>
            {s.cover ? <Photo path={s.cover} size={112} style={{ width: 112, height: 93, borderRadius: 12 }} /> : <View style={[styles.thumbnailPlaceholder, { width: 112, height: 93 }]} />}
            <Text style={styles.thumbTitle} numberOfLines={1}>{s.title}</Text>
            <Small>{s.entryCount ?? 0} moments</Small>
          </Pressable>)}
        </ScrollView> : !error ? <Empty title="Your stories start here" body="Add a few photos, voice notes or words to begin." action="Create a story" onAction={() => router.push('/story/new')} /> : null}
        <Pressable style={[styles.softCard, { backgroundColor: '#F8E5DF', marginTop: 18 }]} onPress={() => router.push({ pathname: '/story/new', params: { quick: '1' } })}>
          <Text style={styles.subheading}>🎙  What made today special?</Text>
          <Small>Capture a quick voice story or write a memory ›</Small>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10 },
  brand: { fontFamily: F.serif, fontSize: 23, color: C.navy, flex: 1 },
  settings: { color: C.ink, fontSize: 25 },
  greeting: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 },
  avatarButton: { width: 53, height: 53, borderRadius: 27, borderWidth: 1, borderColor: C.line, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 51, height: 51, borderRadius: 26 },
  avatarPlus: { position: 'absolute', right: -3, bottom: -2, height: 21, width: 21, borderRadius: 11, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.cream },
  photoPrompt: { backgroundColor: C.greenSoft, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12 },
  hero: { borderRadius: 18, overflow: 'hidden', height: 200, marginTop: 5, backgroundColor: '#E9DED2' },
  heroPhoto: { width: '100%', height: 200, borderRadius: 0 },
  heroOverlay: { position: 'absolute', left: 0, bottom: 0, right: 0, backgroundColor: '#132D25BB', padding: 13, paddingRight: 45 },
  heroTitle: { color: '#FFF', fontFamily: F.serif, fontSize: 20 },
  heroSub: { color: '#FFF', fontFamily: F.sans, fontSize: 12 },
  heroArrow: { position: 'absolute', right: 14, top: 15, color: '#FFF', fontSize: 28 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 7 },
  seeAll: { color: C.green, fontFamily: F.sansMedium, fontSize: 13 },
  horizontal: { marginHorizontal: -S.pad, paddingHorizontal: S.pad },
  thumbnailCard: { width: 112, marginRight: 10, gap: 2 },
  thumbnailPlaceholder: { backgroundColor: '#E7E0D4', borderRadius: 12 },
  thumbTitle: { color: C.navy, fontFamily: F.serif, fontSize: 14, marginTop: 4 },
  softCard: { backgroundColor: '#EFF1E9', padding: 15, borderRadius: 15, marginTop: 8 },
  subheading: { color: C.navy, fontFamily: F.serif, fontSize: 18, marginBottom: 4 },
});
