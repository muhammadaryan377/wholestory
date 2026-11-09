import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Btn, Small } from '@/components/ui';
import { type StoryLocation } from '@/lib/story-preferences';
import { C, F } from '@/lib/theme';

export function StoryLocationPicker({ value, onChange }: {
  value: StoryLocation | null; onChange: (location: StoryLocation | null) => void; disabled?: boolean;
}) {
  const [lat, setLat] = useState(value?.lat.toString() ?? '');
  const [lng, setLng] = useState(value?.lng.toString() ?? '');
  const latitude = Number(lat), longitude = Number(lng);
  const valid = lat.trim() !== '' && lng.trim() !== '' &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  return <View style={{ backgroundColor: C.greenSoft, padding: 14, borderRadius: 14, marginTop: 14 }}>
    <Text style={{ fontFamily: F.serif, color: C.navy, fontSize: 18 }}>Optional story location</Text>
    <Small>On the web, enter coordinates manually. The mobile app also supports GPS.</Small>
    <TextInput placeholder="Latitude (-90 to 90)" value={lat} onChangeText={setLat} keyboardType="decimal-pad" style={{ backgroundColor: C.card, padding: 12, marginTop: 10, borderRadius: 10 }} />
    <TextInput placeholder="Longitude (-180 to 180)" value={lng} onChangeText={setLng} keyboardType="decimal-pad" style={{ backgroundColor: C.card, padding: 12, marginTop: 8, borderRadius: 10 }} />
    <Btn title="Set location" disabled={!valid} kind="outline" onPress={() => onChange({ lat: latitude, lng: longitude, source: 'manual' })} />
    {value ? <Btn title="Remove location" kind="link" onPress={() => onChange(null)} /> : null}
  </View>;
}
