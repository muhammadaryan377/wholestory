import { useEffect, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { favouriteIds, toggleFavourite } from '@/lib/api';
import { viewUrl } from '@/lib/media';
import { C, F } from '@/lib/theme';
import { PrivateLockedError, usePrivateUnlocked } from '@/lib/private-access';
import { Btn, P, Screen } from '@/components/ui';

/** One photo, full screen, with what the photo itself knows: date, time and place. */
export default function PhotoViewer() {
  const p = useLocalSearchParams<{ id: string; path: string; story?: string; title?: string; caption?: string; lat?: string; lng?: string; taken?: string }>();
  const [uri, setUri] = useState(''); const [fav, setFav] = useState(false);
  const unlocked = usePrivateUnlocked();
  const [error, setError] = useState('');
  const { width } = useWindowDimensions();
  useEffect(() => {
    let active = true;
    viewUrl(p.path).then(url => { if (active) { setUri(url); setError(''); } }).catch(e => {
      if (active) { setUri(''); setError(e instanceof PrivateLockedError ? 'Unlock Private albums to view this photo.' : 'Could not load this photo.'); }
    });
    favouriteIds().then(ids => { if (active) setFav(ids.includes(p.id)); }).catch(() => {});
    return () => { active = false; };
  }, [p.path, p.id, unlocked]);
  if (error) return <Screen><P>{error}</P><Btn title="Open Private albums" onPress={() => router.replace('/private')} /></Screen>;
  const taken = p.taken ? new Date(p.taken) : null;
  const chip = (t: string) => <View style={{ backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, marginBottom: 6 }}><Text style={{ color: '#fff', fontFamily: F.sans, fontSize: 13 }}>{t}</Text></View>;
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Image source={uri ? { uri } : undefined} style={{ flex: 1, width }} contentFit="contain" />
      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close"><Text style={{ color: '#fff', fontSize: 30 }}>×</Text></Pressable>
        <Pressable onPress={async () => { const v = !fav; setFav(v); await toggleFavourite(p.id, v); }} hitSlop={12} accessibilityLabel={fav ? 'Remove from Favourites' : 'Add to Favourites'}>
          <Text style={{ fontSize: 28, color: fav ? C.dotRed : '#fff' }}>{fav ? '♥' : '♡'}</Text>
        </Pressable>
      </SafeAreaView>
      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: 'rgba(0,0,0,0.45)' }}>
        {p.caption ? <Text style={{ color: '#fff', fontFamily: F.serifRegular, fontSize: 17, marginBottom: 8 }}>{p.caption}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {taken ? chip(taken.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) : null}
          {taken ? chip(taken.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })) : null}
          {p.lat && p.lng ? <Pressable onPress={() => router.push('/map')}>{chip('📍 On your map')}</Pressable> : null}
        </View>
        {p.story ? <Pressable onPress={() => router.replace(`/story/${p.story}`)}><Text style={{ color: '#fff', fontFamily: F.sansMedium, textDecorationLine: 'underline', marginTop: 4 }}>In {p.title || 'a story'} ›</Text></Pressable> : null}
      </SafeAreaView>
    </View>
  );
}
