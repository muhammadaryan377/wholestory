import { useFocusResource } from '@/lib/use-focus-resource';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { Alert } from '@/lib/alert';
import { listStoriesWithPreferences, type StoryWithPreference } from '@/lib/story-preferences';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip, Empty, Loading, LoadError, Small } from '@/components/ui';
import { Photo } from '@/components/media';
import { BrandHeader } from '@/components/story-chrome';
import { Icon, type IconName } from '@/components/icon';
import { STORY_MAP_AVAILABLE, StoryMapView, type EventMapPin, type StoryMapHandle } from '@/components/story-map-view';
import { getStory, type Entry } from '@/lib/api';
import { placeNames } from '@/lib/places';
import { clusterStories, plural, type MapCluster, type MapZoom } from '@/lib/story-display';
import { C, F, S } from '@/lib/theme';

type Tile = { key: string; title: string; sub: string; cover?: string | null; onPress: () => void };

function ControlButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={styles.control}><Icon name={icon} size={24} color={C.navy} /></Pressable>;
}

const NO_ENTRIES: Entry[] = [];
const storyPath = (id: string) => `/story/${id}` as const;
const viewParams = (view: 'list' | 'calendar') => ({ pathname: '/(tabs)/stories' as const, params: { view, at: String(Date.now()) } });

export default function StoriesMap() {
  const { place: eventPlace, eventTitle, at } = useLocalSearchParams<{ place?: string; eventTitle?: string; at?: string }>();
  const { data: stories, error, reload } = useFocusResource(listStoriesWithPreferences);
  // undefined: nothing touched yet, so the latest story is shown. null: closed by the person.
  const [selected, setSelected] = useState<string[] | null | undefined>(undefined);
  const [loaded, setLoaded] = useState<{ id: string; entries: Entry[] } | null>(null);
  const [zoom, setZoom] = useState<MapZoom | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [locationBusy, setLocationBusy] = useState(false);
  const [eventPin, setEventPin] = useState<EventMapPin | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const map = useRef<StoryMapHandle>(null);

  useEffect(() => {
    let active = true;
    Location.getForegroundPermissionsAsync()
      .then(async p => {
        if (!p.granted || !active) return;
        const pos = await Location.getLastKnownPositionAsync().catch(() => null)
          ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
        if (!active || !pos) return;
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        if (!eventPlace) {
          setSelected(null);
          map.current?.locate(coords.lat, coords.lng);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [eventPlace]);

  useEffect(() => {
    let active = true;
    const placeQuery = eventPlace?.trim();
    if (!placeQuery) {
      Promise.resolve().then(() => { if (active) setEventPin(null); });
      return () => { active = false; };
    }
    Location.geocodeAsync(placeQuery)
      .then(results => {
        if (!active || !results[0]) return;
        const pin: EventMapPin = {
          lat: results[0].latitude,
          lng: results[0].longitude,
          label: eventTitle ? `${eventTitle} · ${placeQuery}` : placeQuery,
        };
        setEventPin(pin);
        setSelected(null);
        map.current?.focusRegion(pin.lat, pin.lng, 0.14, 0.14);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [eventPlace, eventTitle, at]);

  const placed = useMemo(() => (stories ?? []).filter(s => s.lat != null && s.lng != null), [stories]);
  const region = useMemo(() => {
    if (eventPin) {
      return { latitude: eventPin.lat, longitude: eventPin.lng, latitudeDelta: 0.14, longitudeDelta: 0.14 };
    }
    if (userCoords && !eventPlace) {
      return { latitude: userCoords.lat, longitude: userCoords.lng, latitudeDelta: 0.12, longitudeDelta: 0.12 };
    }
    if (!placed.length) return null;
    const lats = placed.map(s => s.lat!), lngs = placed.map(s => s.lng!);
    return {
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2, longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      latitudeDelta: Math.max(0.08, (Math.max(...lats) - Math.min(...lats)) * 1.8), longitudeDelta: Math.max(0.08, (Math.max(...lngs) - Math.min(...lngs)) * 1.8),
    };
  }, [placed, eventPin, userCoords, eventPlace]);
  const selectedIds = useMemo(() => selected === undefined ? placed.slice(0, 1).map(s => s.id) : selected ?? [], [selected, placed]);
  const selectedStories = useMemo(() => placed.filter(s => selectedIds.includes(s.id)), [placed, selectedIds]);
  const single = selectedStories.length === 1 ? selectedStories[0] : null;
  const singleId = single?.id;

  const selEntries = loaded && loaded.id === singleId ? loaded.entries : NO_ENTRIES;
  useEffect(() => {
    let active = true;
    if (singleId) getStory(singleId).then(r => { if (active) setLoaded({ id: singleId, entries: r.entries }); }).catch(() => {});
    return () => { active = false; };
  }, [singleId]);

  // Names for the pins and for each chapter of the open story.
  useEffect(() => {
    let active = true;
    const chapters = selEntries.flatMap(e => {
      const located = e.photos.find(p => p.lat != null && p.lng != null);
      return located ? [{ id: e.id, lat: located.lat!, lng: located.lng! }] : [];
    });
    placeNames([...placed.map(s => ({ id: s.id, lat: s.lat!, lng: s.lng! })), ...chapters])
      .then(found => { if (active) setNames(found); }).catch(() => {});
    return () => { active = false; };
  }, [placed, selEntries]);

  const clusters: MapCluster[] = useMemo(() => {
    if (!region) return [];
    return clusterStories(placed, zoom ?? region).map(cluster => ({ ...cluster, label: names[cluster.stories[0].id] ?? cluster.stories[0].title }));
  }, [placed, zoom, region, names]);

  const changeZoom = (next: MapZoom) => setZoom(current =>
    current && Math.abs(current.latitudeDelta - next.latitudeDelta) / current.latitudeDelta < 0.05 ? current : next);
  const pick = (cluster: MapCluster) => {
    setSelected(cluster.stories.map(s => s.id));
    map.current?.focus(cluster.lat, cluster.lng, cluster.stories.length > 1 ? 1 / 3 : 1);
  };
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
      map.current?.locate(place.coords.latitude, place.coords.longitude);
    } catch (reason) {
      Alert.alert('Location unavailable', reason instanceof Error ? reason.message : 'Try again later.');
    } finally { setLocationBusy(false); }
  };

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!stories) return <Loading />;
  const unplaced = stories.length - placed.length;
  const showInfo = () => Alert.alert('Your story map', `${plural(placed.length, 'story', 'stories')} on the map.${unplaced ? ` ${plural(unplaced, 'story', 'stories')} without a place yet.` : ''} Stories appear here when their photos have a saved location, or when you add one.`);

  const header = <SafeAreaView edges={['top']} style={styles.header}>
    <BrandHeader back />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -S.pad }} contentContainerStyle={{ paddingHorizontal: S.pad }}>
      <Chip label="List" icon="list" onPress={() => router.navigate(viewParams('list'))} />
      <Chip label="Map" icon="pin" on soft />
      <Chip label="People" icon="people" onPress={() => router.push('/people')} />
      <Chip label="Calendar" icon="calendar" onPress={() => router.navigate(viewParams('calendar'))} />
      {placed.length > 0 && region ? (
        <Chip label={`Show all (${placed.length})`} icon="image" onPress={() => {
          setEventPin(null);
          setSelected(placed.map(s => s.id));
          const lats = placed.map(s => s.lat!), lngs = placed.map(s => s.lng!);
          const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
          const lng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
          map.current?.focusRegion(lat, lng, Math.max(0.15, (Math.max(...lats) - Math.min(...lats)) * 1.8), Math.max(0.15, (Math.max(...lngs) - Math.min(...lngs)) * 1.8));
        }} />
      ) : null}
    </ScrollView>
  </SafeAreaView>;

  if (!region) return <View style={{ flex: 1, backgroundColor: C.cream }}>
    {header}
    <View style={{ flex: 1, justifyContent: 'center', padding: S.pad }}>
      <Empty title="No places yet" body="Stories appear on the map when their photos have a location saved. Photos taken on your phone usually do." action="Add a story with a place" onAction={() => router.push('/story/new')} />
    </View>
  </View>;

  const storyTile = (s: StoryWithPreference): Tile => ({ key: s.id, title: s.title, sub: plural(s.photoCount ?? 0, 'photo'), cover: s.cover, onPress: () => router.push(storyPath(s.id)) });
  let tiles: Tile[];
  let title: string, sub: string;
  if (single) {
    const open = () => router.push(storyPath(single.id));
    const chapters = selEntries.filter(e => e.photos.length).map((e, i) => ({ key: e.id, title: names[e.id] ?? `Chapter ${i + 1}`, sub: plural(e.photos.length, 'photo'), cover: e.photos[0].path, onPress: open }));
    tiles = [{ key: 'all', title: 'All photos', sub: plural(single.photoCount ?? 0, 'photo'), cover: single.cover, onPress: open }, ...chapters];
    title = single.title;
    sub = `${plural(single.entryCount ?? 0, 'chapter')} · ${plural(single.photoCount ?? 0, 'photo')}`;
  } else if (selectedStories.length) {
    tiles = selectedStories.map(storyTile);
    title = names[selectedStories[0].id] ?? `${selectedStories.length} stories here`;
    sub = `${selectedStories.length} stories · ${plural(selectedStories.reduce((n, s) => n + (s.photoCount ?? 0), 0), 'photo')}`;
  } else if (eventPin) {
    tiles = placed.map(storyTile);
    title = eventPin.label;
    sub = placed.length ? 'Event location · Tap a photo to see that story.' : 'Event location pinned on the map.';
  } else {
    tiles = placed.map(storyTile);
    title = placed.length ? `${plural(placed.length, 'story', 'stories')} on the map` : 'Near you';
    sub = placed.length ? 'Tap a photo to see that story.' : 'Stories with photo locations appear here.';
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      {header}
      <View style={{ flex: 1 }}>
        <StoryMapView ref={map} region={region} clusters={clusters} selectedIds={selectedIds} eventPin={eventPin} onZoomChange={changeZoom} onPick={pick} onBackgroundPress={() => setSelected(null)} />
        {STORY_MAP_AVAILABLE ? <>
          <View style={styles.controls}>
            <ControlButton icon="locate" label={locationBusy ? 'Finding your location' : 'Go to my location'} onPress={goToCurrentLocation} />
            <View style={styles.zoom}>
              <Pressable onPress={() => map.current?.zoom(0.5)} accessibilityRole="button" accessibilityLabel="Zoom in" style={styles.zoomButton}><Icon name="plus" size={24} color={C.navy} /></Pressable>
              <View style={styles.zoomLine} />
              <Pressable onPress={() => map.current?.zoom(2)} accessibilityRole="button" accessibilityLabel="Zoom out" style={styles.zoomButton}><Icon name="minus" size={24} color={C.navy} /></Pressable>
            </View>
          </View>
          <View style={styles.info}><ControlButton icon="info" label="About this map" onPress={showInfo} /></View>
        </> : null}
      </View>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.sheetHeading}>
          {selectedStories.length ? <Pressable onPress={() => setSelected(null)} accessibilityRole="button" accessibilityLabel="Close this story" hitSlop={10}><Icon name="back" size={26} color={C.navy} /></Pressable> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.sheetTitle} numberOfLines={1}>{title}</Text>
            <Small style={{ color: C.ink }}>{sub}</Small>
          </View>
          {single ? <Pressable onPress={() => router.push(storyPath(single.id))} accessibilityRole="button" accessibilityLabel={'See all of ' + single.title} hitSlop={8} style={styles.seeAll}>
            <Text style={styles.seeAllText}>See all</Text><Icon name="forward" size={16} color={C.green} />
          </Pressable> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -S.pad, marginTop: 8 }} contentContainerStyle={{ paddingHorizontal: S.pad, gap: 8 }}>
          {tiles.map(tile => <Pressable key={tile.key} onPress={tile.onPress} accessibilityRole="button" accessibilityLabel={tile.title} style={{ width: 80 }}>
            {tile.cover ? <Photo path={tile.cover} size={80} style={styles.tilePhoto} /> : <View style={[styles.tilePhoto, { backgroundColor: C.greenSoft }]} />}
            <Text style={styles.tileTitle} numberOfLines={1}>{tile.title}</Text>
            <Text style={styles.tileSub} numberOfLines={1}>{tile.sub}</Text>
          </Pressable>)}
        </ScrollView>
      </View>
    </View>
  );
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 };
const styles = StyleSheet.create({
  header: { backgroundColor: C.cream, paddingHorizontal: S.pad, paddingTop: 8 },
  controls: { position: 'absolute', top: 12, right: 12, gap: 10 },
  control: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', ...shadow },
  zoom: { width: 44, borderRadius: 16, backgroundColor: C.white, alignItems: 'center', ...shadow },
  zoomButton: { width: 44, height: 46, alignItems: 'center', justifyContent: 'center' },
  zoomLine: { width: 28, height: 1, backgroundColor: C.line },
  info: { position: 'absolute', right: 12, bottom: 32 },
  sheet: { marginTop: -20, backgroundColor: C.cream, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: S.pad, paddingTop: 8, paddingBottom: 12 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#D8D2C6', alignSelf: 'center', marginBottom: 8 },
  sheetHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetTitle: { fontFamily: F.serif, fontSize: 23, color: C.navy },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { color: C.green, fontFamily: F.sansMedium, fontSize: 13 },
  tilePhoto: { width: 80, height: 76, borderRadius: 12 },
  tileTitle: { fontFamily: F.sansMedium, fontSize: 13, color: C.navy, marginTop: 4 },
  tileSub: { fontFamily: F.sans, fontSize: 12, color: C.ink },
});
