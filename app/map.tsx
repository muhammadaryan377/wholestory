import { useFocusResource } from '@/lib/use-focus-resource';
import { parseDate } from '@/lib/dates';
import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import * as Location from 'expo-location';
import { Alert } from '@/lib/alert';
import { listStoriesWithPreferences } from '@/lib/story-preferences';
import { router, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { Btn, Chip, Empty, Loading, LoadError, Small, Thread } from '@/components/ui';
import { Photo } from '@/components/media';
import { getStory, type Entry, type Story } from '@/lib/api';
import { C, F, S } from '@/lib/theme';

/** Round photo marker with a white ring and a green count badge, as in the design. */
function StoryPin({ story, selected }: { story: Story; selected: boolean }) {
  const size = selected ? 64 : 54;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size + 6, height: size + 6, borderRadius: (size + 6) / 2, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, borderWidth: selected ? 2 : 0, borderColor: C.green }}>
        {story.cover ? <Photo path={story.cover} size={size} style={{ borderRadius: size / 2 }} />
          : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.greenSoft }} />}
      </View>
      <View style={{ position: 'absolute', top: -4, right: -6, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.white }}>
        <Text style={{ color: C.white, fontFamily: F.sansBold, fontSize: 11 }}>{story.entryCount ?? 0}</Text>
      </View>
    </View>
  );
}

export default function StoriesMap() {
  const { data: stories, error, reload } = useFocusResource(listStoriesWithPreferences);
  const [sel, setSel] = useState<Story | null>(null);
  const [selEntries, setSelEntries] = useState<Entry[]>([]);
  const [tracking, setTracking] = useState(true);
  const [showUserLocation, setShowUserLocation] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const mapRef = useRef<MapView>(null);
  // let the photo markers draw, then stop redrawing them (keeps the map smooth)
  useEffect(() => { const t = setTimeout(() => setTracking(false), 2500); return () => clearTimeout(t); }, [stories, sel?.id]);
  useEffect(() => {
    let active = true;
    if (sel) getStory(sel.id).then(r => { if (active) setSelEntries(r.entries); }).catch(() => { if (active) setSelEntries([]); });
    return () => { active = false; };
  }, [sel]);

  const goToCurrentLocation = async () => {
    if (locationBusy) return;
    setLocationBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Location not allowed', 'You can still browse stories on the map. Location is optional.');
        return;
      }
      const place = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setShowUserLocation(true);
      mapRef.current?.animateToRegion({
        latitude: place.coords.latitude, longitude: place.coords.longitude,
        latitudeDelta: 0.09, longitudeDelta: 0.09,
      }, 400);
    } catch (reason) {
      Alert.alert('Location unavailable', reason instanceof Error ? reason.message : 'Try again later.');
    } finally { setLocationBusy(false); }
  };

  const header = (
    <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(248,243,232,0.96)', paddingHorizontal: S.pad, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back"><Text style={{ fontSize: 26, color: C.ink }}>‹</Text></Pressable>
        <Text style={{ fontFamily: F.serif, fontSize: 26, color: C.navy }}>Stories</Text>
        <Thread width={90} />
      </View>
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        <Chip label="List" onPress={() => router.navigate('/(tabs)/stories')} />
        <Chip label="Map" on />
        <Chip label="People" onPress={() => router.push('/people')} />
        <Chip label={locationBusy ? "Locating…" : "◎ My location"} onPress={goToCurrentLocation} />
      </View>
    </SafeAreaView>
  );

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!stories) return <Loading />;
  const placed = stories.filter(s => s.lat != null && s.lng != null);
  const unplaced = stories.length - placed.length;
  if (!placed.length) return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, justifyContent: 'center', padding: S.pad }}>
        <Empty title="No places yet" body="Stories appear on the map when their photos have a location saved. Photos taken on your phone usually do." action="Add a story with a place" onAction={() => router.push("/story/new")} />
      </View>
      {header}
    </View>
  );
  const lats = placed.map(s => s.lat!), lngs = placed.map(s => s.lng!);
  const region = { latitude: (Math.min(...lats) + Math.max(...lats)) / 2, longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max(0.08, (Math.max(...lats) - Math.min(...lats)) * 1.8), longitudeDelta: Math.max(0.08, (Math.max(...lngs) - Math.min(...lngs)) * 1.8) };
  const photos = selEntries.flatMap(e => e.photos).slice(0, 8);

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      <Stack.Screen options={{ headerShown: false }} />
      <MapView ref={mapRef} style={{ flex: 1 }} initialRegion={region} mapType="mutedStandard" showsUserLocation={showUserLocation} showsMyLocationButton={false} showsPointsOfInterests={false} showsCompass={false} pitchEnabled={false}
        onPress={e => { if (e.nativeEvent.action !== 'marker-press') setSel(null); }}>
        {placed.map(s => (
          <Marker key={s.id} coordinate={{ latitude: s.lat!, longitude: s.lng! }} tracksViewChanges={tracking} anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => { setTracking(true); setSelEntries([]); setSel(s); mapRef.current?.animateToRegion({ latitude: s.lat!, longitude: s.lng!, latitudeDelta: region.latitudeDelta / 3, longitudeDelta: region.longitudeDelta / 3 }, 350); }}>
            <StoryPin story={s} selected={sel?.id === s.id} />
          </Marker>
        ))}
      </MapView>
      {header}

      {/* Bottom card, as in the design: the chosen story and its photos */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.cream, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: S.pad, paddingTop: 10, paddingBottom: 30,
        shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: -3 } }}>
        <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: '#D8D2C6', alignSelf: 'center', marginBottom: 10 }} />
        {sel ? (<>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={{ fontFamily: F.serif, fontSize: 22, color: C.navy, flex: 1 }} numberOfLines={1}>{sel.title}</Text>
            <Pressable onPress={() => router.push(`/story/${sel.id}`)} hitSlop={8}><Text style={{ fontFamily: F.sansMedium, color: C.green }}>Open ›</Text></Pressable>
          </View>
          <Small>{sel.entryCount ?? 0} {sel.entryCount === 1 ? 'moment' : 'moments'} · {selEntries.reduce((n, e) => n + e.photos.length, 0)} photos · {parseDate(sel.story_date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</Small>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginHorizontal: -S.pad, paddingLeft: S.pad }}>
            {photos.map(p => <Pressable key={p.id} onPress={() => router.push(`/story/${sel.id}`)} style={{ marginRight: 8 }}><Photo path={p.path} size={78} /></Pressable>)}
          </ScrollView>
          <Btn title="Open story" onPress={() => router.push(`/story/${sel.id}`)} style={{ marginTop: 10 }} />
        </>) : (<>
          <Text style={{ fontFamily: F.serif, fontSize: 20, color: C.navy }}>{placed.length} {placed.length === 1 ? 'story' : 'stories'} on the map</Text>
          <Small>Tap a photo to see that story.{unplaced ? ` ${unplaced} ${unplaced === 1 ? 'story has' : 'stories have'} no place saved yet.` : ''}</Small>
        </>)}
      </View>
    </View>
  );
}
