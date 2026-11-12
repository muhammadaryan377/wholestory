import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { C, F, S } from '@/lib/theme';
import { STORY_MAP_AVAILABLE } from '@/lib/map-availability';
import type { MapCluster, MapZoom } from '@/lib/story-display';
import { Photo } from './media';
import { Icon } from './icon';

export type StoryMapHandle = {
  zoom: (factor: number) => void;
  focus: (lat: number, lng: number, factor?: number) => void;
  focusRegion: (lat: number, lng: number, latDelta?: number, lngDelta?: number) => void;
  locate: (lat: number, lng: number) => void;
};
export type EventMapPin = { lat: number; lng: number; label: string };
export type StoryMapProps = {
  region: Region;
  clusters: MapCluster[];
  selectedIds: string[];
  eventPin?: EventMapPin | null;
  onZoomChange: (zoom: MapZoom) => void;
  onPick: (cluster: MapCluster) => void;
  onBackgroundPress: () => void;
};

export { STORY_MAP_AVAILABLE };

/** Round photo marker with a white ring, a green photo count and the place name beneath. */
function StoryPin({ cluster, selected }: { cluster: MapCluster; selected: boolean }) {
  const size = selected ? 64 : 56;
  return (
    <View style={{ width: 116, alignItems: 'center', paddingTop: 8 }}>
      <View>
        <View style={{ width: size + 6, height: size + 6, borderRadius: (size + 6) / 2, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', borderWidth: selected ? 2 : 0, borderColor: C.green }}>
          {cluster.cover ? <Photo path={cluster.cover} size={size} style={{ borderRadius: size / 2 }} />
            : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.greenSoft }} />}
        </View>
        <View style={{ position: 'absolute', top: -6, right: -8, minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 5, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.white }}>
          <Text style={{ color: C.white, fontFamily: F.sansBold, fontSize: 12 }}>{cluster.photos}</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: F.sansBold, fontSize: 13, color: C.navy, textShadowColor: '#FFF', textShadowRadius: 4 }}>{cluster.label}</Text>
    </View>
  );
}

export const StoryMapView = forwardRef<StoryMapHandle, StoryMapProps>(function StoryMapView({ region, clusters, selectedIds, eventPin, onZoomChange, onPick, onBackgroundPress }, ref) {
  const map = useRef<MapView>(null);
  const current = useRef<Region>(region);
  const [showUser, setShowUser] = useState(false);
  // let the photo markers draw, then stop redrawing them (keeps the map smooth)
  const drawing = useMemo(() => ({ clusters, selectedIds }), [clusters, selectedIds]);
  const [drawn, setDrawn] = useState<typeof drawing | null>(null);
  const tracking = drawn !== drawing;
  useEffect(() => {
    const timer = setTimeout(() => setDrawn(drawing), 2500);
    return () => clearTimeout(timer);
  }, [drawing]);

  useImperativeHandle(ref, () => ({
    zoom: factor => {
      const r = current.current;
      map.current?.animateToRegion({ ...r, latitudeDelta: r.latitudeDelta * factor, longitudeDelta: r.longitudeDelta * factor }, 250);
    },
    focus: (latitude, longitude, factor = 1) => {
      const r = current.current;
      map.current?.animateToRegion({ latitude, longitude, latitudeDelta: r.latitudeDelta * factor, longitudeDelta: r.longitudeDelta * factor }, 350);
    },
    focusRegion: (latitude, longitude, latitudeDelta = 0.14, longitudeDelta = 0.14) => {
      map.current?.animateToRegion({ latitude, longitude, latitudeDelta, longitudeDelta }, 380);
    },
    locate: (latitude, longitude) => {
      setShowUser(true);
      map.current?.animateToRegion({ latitude, longitude, latitudeDelta: 0.09, longitudeDelta: 0.09 }, 400);
    },
  }), []);

  if (!STORY_MAP_AVAILABLE) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.pad, backgroundColor: C.greenSoft }}>
      <Icon name="pin" size={40} color={C.green} />
      <Text style={{ fontFamily: F.serif, fontSize: 20, color: C.navy, marginTop: 8, textAlign: 'center' }}>The map isn’t switched on in this version</Text>
      <Text style={{ fontFamily: F.sans, fontSize: 14, color: C.ink, marginTop: 4, textAlign: 'center' }}>Your places are listed below.</Text>
    </View>
  );

  return (
    <MapView ref={map} style={{ flex: 1 }} initialRegion={region} mapType="mutedStandard" showsUserLocation={showUser} showsMyLocationButton={false} showsPointsOfInterests={false} showsCompass={false} pitchEnabled={false}
      onRegionChangeComplete={next => { current.current = next; onZoomChange({ latitudeDelta: next.latitudeDelta, longitudeDelta: next.longitudeDelta }); }}
      onPress={e => { if (e.nativeEvent.action !== 'marker-press') onBackgroundPress(); }}>
      {clusters.map(cluster => (
        <Marker key={cluster.key} coordinate={{ latitude: cluster.lat, longitude: cluster.lng }} tracksViewChanges={tracking} anchor={{ x: 0.5, y: 0.42 }} onPress={() => onPick(cluster)}>
          <StoryPin cluster={cluster} selected={cluster.stories.some(story => selectedIds.includes(story.id))} />
        </Marker>
      ))}
      {eventPin ? (
        <Marker coordinate={{ latitude: eventPin.lat, longitude: eventPin.lng }} title={eventPin.label} pinColor={C.green} />
      ) : null}
    </MapView>
  );
});
