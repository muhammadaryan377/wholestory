import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Btn, Small } from '@/components/ui';
import { type StoryLocation } from '@/lib/story-preferences';
import { C, F } from '@/lib/theme';
import { Alert } from '@/lib/alert';
import { STORY_MAP_AVAILABLE } from '@/lib/map-availability';
import { Icon } from './icon';

export function StoryLocationPicker({ value, onChange, disabled }: {
  value: StoryLocation | null; onChange: (place: StoryLocation | null) => void; disabled?: boolean;
}) {
  const [mapVisible, setMapVisible] = useState(false);
  const [draft, setDraft] = useState<StoryLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const current = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Location not allowed', 'You can choose a place on the map or save the story without a location.');
        return;
      }
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      onChange({ lat: result.coords.latitude, lng: result.coords.longitude, source: 'current' });
      setMapVisible(false);
    } catch (e) {
      Alert.alert('Could not read your location', e instanceof Error ? e.message : 'Choose a place manually instead.');
    } finally { setBusy(false); }
  };
  const openMap = () => { setDraft(value); setMapVisible(true); };

  return <View style={styles.outer}>
    <Text style={styles.title}>Add a story location (optional)</Text>
    <Small>{value ? `Selected: ${value.lat.toFixed(4)}, ${value.lng.toFixed(4)} · ${value.source === 'manual' ? 'Chosen on map' : 'Current location'}`
      : 'Use the photo’s original GPS, or choose a place yourself.'}</Small>
    <View style={styles.actions}>
      <Pressable disabled={busy || disabled} onPress={current} accessibilityRole="button" style={styles.pill}>
        {busy ? <ActivityIndicator size="small" color={C.green} /> : <View style={styles.pillRow}><Icon name="locate" size={14} color={C.green} /><Text style={styles.link}>Use current location</Text></View>}
      </Pressable>
      {STORY_MAP_AVAILABLE ? <Pressable disabled={disabled} onPress={openMap} accessibilityRole="button" style={styles.pill}>
        <View style={styles.pillRow}><Icon name="pin" size={14} color={C.green} /><Text style={styles.link}>Choose on map</Text></View>
      </Pressable> : null}
      {value ? <Pressable disabled={disabled} onPress={() => onChange(null)} accessibilityRole="button" style={styles.pill}>
        <Text style={styles.link}>Remove</Text>
      </Pressable> : null}
    </View>
    <Small style={{ marginTop: 7 }}>No background tracking. Permission is requested only when you tap Use current location.</Small>

    {STORY_MAP_AVAILABLE ? <Modal visible={mapVisible} animationType="slide" onRequestClose={() => setMapVisible(false)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.cream }}>
        <View style={styles.mapHeader}><Text style={styles.title}>Choose a place</Text><Pressable onPress={() => setMapVisible(false)} accessibilityLabel="Close map"><Text style={styles.link}>Cancel</Text></Pressable></View>
        <Small style={{ paddingHorizontal: 16, marginBottom: 8 }}>Tap the map to place a pin. Your location is not read automatically.</Small>
        <MapView style={{ flex: 1 }}
          initialRegion={{ latitude: draft?.lat ?? 20, longitude: draft?.lng ?? 0, latitudeDelta: draft ? 0.2 : 100, longitudeDelta: draft ? 0.2 : 130 }}
          onPress={e => { const { latitude, longitude } = e.nativeEvent.coordinate; setDraft({ lat: latitude, lng: longitude, source: 'manual' }); }}>
          {draft ? <Marker coordinate={{ latitude: draft.lat, longitude: draft.lng }} /> : null}
        </MapView>
        <View style={{ paddingHorizontal: 18, paddingVertical: 10 }}>
          {draft ? <Small style={{ textAlign: 'center' }}>Pin: {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}</Small> : <Small style={{ textAlign: 'center' }}>No place selected yet</Small>}
          <Btn title="Use this place" disabled={!draft} onPress={() => { if (draft) onChange({ ...draft, source: 'manual' }); setMapVisible(false); }} />
        </View>
      </SafeAreaView>
    </Modal> : null}
  </View>;
}

const styles = StyleSheet.create({
  outer: { marginTop: 12, marginBottom: 14, backgroundColor: '#EEF0E8', borderRadius: 16, padding: 13 },
  title: { fontFamily: F.serif, fontSize: 17, color: C.navy, marginBottom: 5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, gap: 7 },
  pill: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8, minHeight: 38, justifyContent: 'center' },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  link: { fontFamily: F.sansMedium, color: C.green, fontSize: 12 },
  mapHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
});
