import { parseDate } from '@/lib/dates';
import { useCallback, useState } from 'react';
import { View, Text, Pressable, RefreshControl, ScrollView } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, H1, H2, P, Small, Thread, Empty, Btn } from '@/components/ui';
import { Photo } from '@/components/media';
import { listStories, memoryFilter, myName, type Story } from '@/lib/api';
import { findSuggestions, libraryAllowed, toPicked, type Suggestion } from '@/lib/suggest';
import { getPrefs, scheduleLocal } from '@/lib/notify';
import { handOff } from '@/lib/handoff';
import { readLocalProfilePhoto } from '@/lib/profile-photo';
import { useAuth } from '@/lib/auth';
import { Image } from 'expo-image';
import { C, F, S } from '@/lib/theme';

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const sameDayLastYears = (d: string) => { const t = new Date(); const x = parseDate(d); return x.getDate() === t.getDate() && x.getMonth() === t.getMonth() && x.getFullYear() < t.getFullYear(); };

export default function Today() {
  const { session } = useAuth();
  const [avatar, setAvatar] = useState<string | null>(null);
  const [name, setName] = useState(''); const [stories, setStories] = useState<Story[] | null>(null); const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [allowed, setAllowed] = useState<boolean | null>(null); const [sugs, setSugs] = useState<Suggestion[]>([]); const [keep, setKeep] = useState<((s: Story) => boolean) | null>(null);
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setName(await myName()); if (session?.user.id) setAvatar(await readLocalProfilePhoto(session.user.id).catch(() => null)); const st = await listStories(); const f = await memoryFilter(); setKeep(() => f); setStories(st);
      const ok = await libraryAllowed(); setAllowed(ok); if (ok) setSugs(await findSuggestions(6));
      scheduleLocal(st.filter(f), await getPrefs()).catch(() => {});
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load your stories.'); }
    finally { setBusy(false); }
  }, [session?.user.id]);
  const tell = async (s: Suggestion) => { handOff({ photos: await toPicked(s.assets), title: s.title, prompt: 'What do you remember most about this?' }); router.push('/story/new'); };
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const memories = (stories ?? []).filter(s => (keep ? keep(s) : !s.hidden_from_memories) && sameDayLastYears(s.story_date));
  const recent = (stories ?? []).slice(0, 6);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.cream }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: S.pad, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: F.serif, fontSize: 24, color: C.navy }}>Whole Stories</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Thread width={88} />{avatar ? <Image source={{ uri: avatar }} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.greenSoft }} contentFit="cover" accessibilityLabel="Your profile photo" /> : null}</View>
        </View>
        <H1 style={{ marginTop: 6 }}>{greet()}{name ? `, ${name}` : ''}</H1>
        <P muted style={{ marginBottom: 16 }}>A new day. More memories to discover.</P>
        {error ? <Card><P accessibilityRole="alert">{error}</P><Btn title="Try again" onPress={load} /></Card> : null}

        <Card onPress={() => router.push({ pathname: '/story/new', params: { quick: '1' } })} style={{ backgroundColor: '#F6E4DE', borderColor: '#EBCFC6' }}>
          <Text style={{ fontFamily: F.serif, fontSize: 18, color: C.navy }}>What made today special?</Text>
          <Small>Say it in a few seconds. It’s the easiest way to start.</Small>
        </Card>

        {allowed && sugs.length ? (<>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}><H2>Stories waiting to be told</H2><Pressable onPress={() => router.push('/suggestions')}><Text style={{ fontFamily: F.sansMedium, color: C.green }}>See all</Text></Pressable></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -S.pad, paddingLeft: S.pad, marginBottom: 12 }}>
            {sugs.slice(0, 5).map(s => (
              <Pressable key={s.id} onPress={() => tell(s)} style={{ width: 130, marginRight: 10 }}>
                <Image source={{ uri: s.assets[0].uri }} style={{ width: 130, height: 120, borderRadius: 12 }} contentFit="cover" />
                <Text style={{ fontFamily: F.serif, fontSize: 14, color: C.navy, marginTop: 5 }} numberOfLines={2}>{s.title}</Text>
                <Small>{s.sub}</Small>
              </Pressable>
            ))}
          </ScrollView>
        </>) : null}
        {allowed === false ? (
          <Card onPress={() => router.push('/suggestions')}><Text style={{ fontFamily: F.serif, fontSize: 17, color: C.navy }}>Let Wholestory find your moments</Text><Small>Allow access to your photos and we’ll suggest stories from trips, days out and the people you love. It all happens on your phone.</Small></Card>
        ) : null}

        {stories && stories.length === 0 ? (
          <Empty title="Your stories start here" body="Add a few photos and say what happened. We’ll keep the whole story, and it can grow over time." action="Add your first photos" onAction={() => router.push('/story/new')} />
        ) : null}

        {stories && stories.length > 0 ? (<>
          <H2 style={{ marginTop: 8 }}>This day last year</H2>
          {memories.length ? memories.map(s => (
            <Card key={s.id} onPress={() => router.push(`/story/${s.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              {s.cover ? <Photo path={s.cover} size={64} /> : null}
              <View style={{ flex: 1 }}><Text style={{ fontFamily: F.serif, fontSize: 17, color: C.navy }}>{s.title}</Text><Small>{parseDate(s.story_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</Small></View>
            </Card>
          )) : <Card><Small>Nothing from this day in past years yet. Memories you add will come back here on their anniversary.</Small></Card>}

          <H2 style={{ marginTop: 8 }}>Continue your story</H2>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -S.pad, paddingLeft: S.pad }}>
            {recent.map(s => (
              <Pressable key={s.id} onPress={() => router.push(`/story/${s.id}`)} style={{ width: 150, marginRight: 10 }}>
                {s.cover ? <Photo path={s.cover} size={150} /> : <View style={{ width: 150, height: 150, borderRadius: 10, backgroundColor: '#E9E4D9' }} />}
                <Text style={{ fontFamily: F.serif, fontSize: 15, color: C.navy, marginTop: 6 }} numberOfLines={1}>{s.title}</Text>
                <Small>{s.entryCount ?? 0} {s.entryCount === 1 ? 'moment' : 'moments'}</Small>
              </Pressable>
            ))}
          </ScrollView>
          <Btn kind="outline" title="Start a new story" onPress={() => router.push('/story/new')} style={{ marginTop: 14 }} />
        </>) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
