import { useCallback, useState } from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { Alert } from '@/lib/alert';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Screen, H1, P, Card, Small, Btn, Empty, Loading, LoadError } from '@/components/ui';
import { dismiss, findSuggestions, libraryAllowed, toPicked, type Suggestion } from '@/lib/suggest';
import { createStory, emptyDraft } from '@/lib/api';
import { handOff } from '@/lib/handoff';
import { C, F } from '@/lib/theme';

export default function Suggestions() {
  const [allowed, setAllowed] = useState<boolean | null>(null); const [list, setList] = useState<Suggestion[] | null>(null); const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setError(''); const ok = await libraryAllowed(); setAllowed(ok); if (ok) setList(await findSuggestions()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not read your photo library.'); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const allow = async () => { if (await libraryAllowed(true)) load(); else Alert.alert('Photos not allowed', 'You can allow full photo access for Whole Stories in your phone Settings.'); };
  const tell = async (s: Suggestion) => { setBusy(s.id); try { handOff({ photos: await toPicked(s.assets), title: s.title, prompt: 'What do you remember most about this?' }); router.push('/story/new'); } finally { setBusy(null); } };
  const keep = async (s: Suggestion) => {
    setBusy(s.id);
    try { const photos = await toPicked(s.assets); const id = await createStory(s.title, new Date(s.start).toISOString().slice(0, 10), { ...emptyDraft(), photos }); await dismiss(s.id).catch(() => {}); router.push(`/story/${id}`); }
    catch (e: any) { Alert.alert('Could not save', e.message ?? 'Please try again.'); } finally { setBusy(null); }
  };
  if (error) return <LoadError error={error} onRetry={load} />;
  if (Platform.OS === 'web') return <Screen><Empty title="Suggestions from your phone" body="Open Whole Stories on your iPhone to find stories in your photo library. You can still choose photos when creating a story here." action="Choose photos for a story" onAction={() => router.push('/story/new')} /></Screen>;
  if (allowed === null) return <Loading />;
  if (!allowed) return <Screen><Empty title="Let Whole Stories find your moments" body="Allow access to your photos and we’ll suggest stories from trips, days out and the people you love. It all happens on your phone." action="Allow photo access" onAction={allow} /></Screen>;
  if (!list) return <Loading />;
  return (
    <Screen>
      <H1>Stories in your photos</H1>
      <P muted style={{ marginBottom: 12 }}>Found on your phone from the last two years. Only you can see these suggestions.</P>
      {!list.length ? <Empty title="You’re all caught up" body="New suggestions appear as you take more photos." /> : null}
      {list.map(s => (
        <Card key={s.id}>
          <View style={{ flexDirection: 'row', gap: 4, height: 140, marginBottom: 8 }}>
            <Image source={{ uri: s.assets[0].uri }} style={{ flex: 2, borderRadius: 10 }} contentFit="cover" />
            <View style={{ flex: 1, gap: 4 }}>
              <Image source={{ uri: s.assets[Math.floor(s.assets.length / 2)].uri }} style={{ flex: 1, borderRadius: 10 }} contentFit="cover" />
              <Image source={{ uri: s.assets[s.assets.length - 1].uri }} style={{ flex: 1, borderRadius: 10 }} contentFit="cover" />
            </View>
          </View>
          <Text style={{ fontFamily: F.serif, fontSize: 18, color: C.navy }}>{s.title}</Text>
          <Small>{s.sub}</Small>
          {busy === s.id ? <ActivityIndicator color={C.green} style={{ marginTop: 10 }} /> : (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Btn title="Tell this story" onPress={() => tell(s)} style={{ flex: 1 }} />
              <Btn title="Keep" kind="outline" onPress={() => keep(s)} style={{ flex: 0.6 }} />
            </View>)}
          <Btn kind="link" title="Not now" onPress={async () => { await dismiss(s.id); setList(list.filter(x => x.id !== s.id)); }} />
        </Card>
      ))}
    </Screen>
  );
}
