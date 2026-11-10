import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { favouriteIds, toggleFavourite } from '@/lib/api';
import { viewUrl } from '@/lib/media';
import { C, F } from '@/lib/theme';
import { PrivateLockedError, usePrivateUnlocked } from '@/lib/private-access';
import { Btn, P, Screen } from '@/components/ui';
import { Alert } from '@/lib/alert';
import { Icon } from '@/components/icon';

const CLOSE_DISTANCE = 120;
const FLICK_DISTANCE = 40;
const FLICK_VELOCITY = 0.8;
const HEART_PATH = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

const closeViewer = () => {
  if (router.canGoBack()) router.back();
  else router.replace('/');
};

/** One photo, full screen, with what the photo itself knows: date, time and place. */
export default function PhotoViewer() {
  const p = useLocalSearchParams<{ id: string; path: string; story?: string; title?: string; caption?: string; lat?: string; lng?: string; taken?: string }>();
  const [uri, setUri] = useState(''); const [fav, setFav] = useState(false);
  const [savingFavourite, setSavingFavourite] = useState(false);
  const unlocked = usePrivateUnlocked();
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false);
  const [retry, setRetry] = useState(0);
  const insets = useSafeAreaInsets();
  const [drag] = useState(() => new Animated.Value(0));
  const [swipeDown] = useState(() => {
    const settle = () => Animated.spring(drag, { toValue: 0, useNativeDriver: false }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && g.dy > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > CLOSE_DISTANCE || (g.dy > FLICK_DISTANCE && g.vy > FLICK_VELOCITY)) closeViewer();
        else settle();
      },
      onPanResponderTerminate: settle,
    });
  });
  useEffect(() => {
    let active = true;
    viewUrl(p.path).then(url => { if (!url) throw new Error('Photo unavailable'); if (active) { setUri(url); setError(''); setLocked(false); } }).catch(e => {
      if (active) { setUri(''); setLocked(e instanceof PrivateLockedError); setError(e instanceof PrivateLockedError ? 'Unlock Private albums to view this photo.' : 'Could not load this photo.'); }
    });
    favouriteIds().then(ids => { if (active) setFav(ids.includes(p.id)); }).catch(() => {});
    return () => { active = false; };
  }, [p.path, p.id, unlocked, retry]);
  if (error) return <Screen><P>{error}</P>{locked ? <Btn title="Open Private albums" onPress={() => router.replace('/private')} /> : <Btn title="Try again" onPress={() => setRetry(value => value + 1)} />}<Btn kind="link" title="Back" onPress={() => router.back()} /></Screen>;
  const taken = p.taken ? new Date(p.taken) : null;
  const chip = (t: string) => <View style={styles.chip}><Text style={styles.chipText}>{t}</Text></View>;
  const chromeOpacity = drag.interpolate({ inputRange: [0, 160], outputRange: [1, 0], extrapolate: 'clamp' });
  const heartColor = fav ? C.dotRed : '#fff';
  return (
    <View style={styles.root} {...swipeDown.panHandlers}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: drag }] }]}>
        <Image source={uri ? { uri } : undefined} style={StyleSheet.absoluteFill} contentFit="contain" />
        {!uri ? <View style={[StyleSheet.absoluteFill, styles.center]}><ActivityIndicator color="#fff" size="large" /></View> : null}
      </Animated.View>
      <Animated.View pointerEvents="box-none" style={[styles.top, { opacity: chromeOpacity, paddingTop: insets.top + 8, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
        <View style={styles.handle} />
        <View pointerEvents="box-none" style={styles.topRow}>
          <Pressable onPress={closeViewer} hitSlop={6} accessibilityRole="button" accessibilityLabel="Back" style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><Icon name="arrowBack" size={24} color="#fff" /></Pressable>
          <Pressable disabled={savingFavourite} onPress={async () => {
            if (savingFavourite) return;
            setSavingFavourite(true);
            try { await toggleFavourite(p.id, !fav); setFav(!fav); }
            catch (e) { Alert.alert('Could not update Favourites', e instanceof Error ? e.message : 'Please try again.'); }
            finally { setSavingFavourite(false); }
          }} hitSlop={6} accessibilityRole="button" accessibilityLabel={fav ? 'Remove from Favourites' : 'Add to Favourites'} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <Svg width={24} height={24} viewBox="0 0 24 24"><Path d={HEART_PATH} fill={fav ? heartColor : 'none'} stroke={heartColor} strokeWidth={2} strokeLinejoin="round" /></Svg>
          </Pressable>
        </View>
      </Animated.View>
      <Animated.View pointerEvents="box-none" style={[styles.bottom, { opacity: chromeOpacity, paddingBottom: insets.bottom + 16, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
        {p.caption ? <Text style={styles.caption}>{p.caption}</Text> : null}
        <View pointerEvents="box-none" style={styles.chips}>
          {taken ? chip(taken.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) : null}
          {taken ? chip(taken.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })) : null}
          {p.lat && p.lng ? <Pressable onPress={() => router.push('/map')} hitSlop={8} accessibilityRole="button">{chip('On your map')}</Pressable> : null}
        </View>
        {p.story ? <Pressable onPress={() => router.replace(`/story/${p.story}`)} accessibilityRole="button" style={styles.album}><Text numberOfLines={1} style={styles.albumText}>In {p.title || 'a story'} ›</Text></Pressable> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)', marginBottom: 12 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between' },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(38,38,38,0.85)' },
  pressed: { opacity: 0.6 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingTop: 16, backgroundColor: 'rgba(0,0,0,0.45)' },
  caption: { color: '#fff', fontFamily: F.serifRegular, fontSize: 17, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { backgroundColor: 'rgba(38,38,38,0.85)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, marginBottom: 8 },
  chipText: { color: '#fff', fontFamily: F.sans, fontSize: 13 },
  album: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  albumText: { color: '#fff', fontFamily: F.sansMedium, fontSize: 15, textDecorationLine: 'underline' },
});
