import { useState } from 'react';
import { View, Pressable, Text, TextInput } from 'react-native';
import { Alert } from '@/lib/alert';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Screen, H1, H2, P, Field, Btn, Chip, Small } from '@/components/ui';
import { createEvent } from '@/lib/api';
import { C, F } from '@/lib/theme';
import { dateInput } from '@/lib/dates';

const TYPES = ['Wedding', 'Birthday', 'Holiday', 'Family gathering', 'Graduation', 'Other'];
type M = { name: string; time: string };
const mk = (xs: [string, string][]): M[] => xs.map(([time, name]) => ({ time, name }));
const DEFAULTS: Record<string, M[]> = {
  Wedding: mk([['3:00 PM', 'Ceremony'], ['4:00 PM', 'Drinks & canapés'], ['6:00 PM', 'Dinner'], ['9:00 PM', 'Dancing']]),
  Birthday: mk([['', 'Arrivals'], ['', 'Cake'], ['', 'Party']]), Holiday: mk([['', 'Day 1'], ['', 'Day 2'], ['', 'Day 3']]),
  'Family gathering': mk([['', 'Arrivals'], ['', 'Meal'], ['', 'Games']]), Graduation: mk([['', 'Ceremony'], ['', 'Celebration']]), Other: mk([['', 'Arrivals'], ['', 'Highlights']]),
};

export default function NewEvent() {
  const [kind, setKind] = useState('Wedding'); const [name, setName] = useState(''); const [place, setPlace] = useState('');
  const [start, setStart] = useState(''); const [end, setEnd] = useState('');
  const [moments, setMoments] = useState<M[]>(DEFAULTS.Wedding); const [newM, setNewM] = useState(''); const [busy, setBusy] = useState(false);
  const [cover, setCoverUri] = useState<string | null>(null);
  const pickCover = async () => { const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [16, 9] }); if (!r.canceled) setCoverUri(r.assets[0].uri); };
  const iso = dateInput;
  const save = async () => {
    if (busy) return;
    if (!name.trim()) return Alert.alert('Name your event', 'For example “Maya & Tom’s Wedding”.');
    if (start && !iso(start)) return Alert.alert('Check the date', 'Use day/month/year, e.g. 15/09/2026.');
    if (end && !iso(end)) return Alert.alert('Check the end date', 'Enter a valid day/month/year.');
    if (end && !start) return Alert.alert('Add a start date', 'Choose the start date before the end date.');
    if (start && end && iso(end)! < iso(start)!) return Alert.alert('Check the dates', 'The end date cannot be before the start date.');
    setBusy(true);
    try {
      const id = await createEvent({ name: name.trim(), kind, place: place.trim(), starts_on: iso(start), ends_on: iso(end) ?? iso(start) }, moments.map(m => ({ day: 1, time_label: m.time.trim(), name: m.name })), cover);
      router.replace(`/event/${id}`);
    } catch (e: any) { Alert.alert('Could not create', e.message ?? 'Please try again.'); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <H1>Create an event wall</H1>
      <P muted style={{ marginBottom: 12 }}>Bring everyone’s photos, memories and moments together in one place.</P>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{TYPES.map(t => <Chip key={t} label={t} on={kind === t} onPress={() => { setKind(t); setMoments(DEFAULTS[t]); }} />)}</View>
      <Pressable onPress={pickCover} accessibilityLabel="Choose a cover photo" style={{ marginBottom: 12 }}>
        {cover ? <Image source={{ uri: cover }} style={{ width: '100%', height: 170, borderRadius: 14 }} contentFit="cover" />
          : <View style={{ height: 110, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: '#CFC8BA', alignItems: 'center', justifyContent: 'center', backgroundColor: C.card }}><Text style={{ fontFamily: F.sansMedium, color: C.green }}>＋ Add a cover photo</Text><Text style={{ fontFamily: F.sans, fontSize: 12, color: C.grey }}>Guests see it at the top of the wall</Text></View>}
      </Pressable>
      <Field label="Event name" value={name} onChangeText={setName} placeholder="e.g. Maya & Tom’s Wedding" />
      <Field label="Place" value={place} onChangeText={setPlace} placeholder="e.g. Lake Como, Italy" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Field label="Starts" value={start} onChangeText={setStart} placeholder="dd/mm/yyyy" keyboardType="numbers-and-punctuation" /></View>
        <View style={{ flex: 1 }}><Field label="Ends (optional)" value={end} onChangeText={setEnd} placeholder="dd/mm/yyyy" keyboardType="numbers-and-punctuation" /></View>
      </View>
      <H2>Moments</H2>
      <Small style={{ marginBottom: 8 }}>The sections of your wall. You can change them later.</Small>
      {moments.map((m, i) => (
        <View key={m.name + i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 }}>
          <TextInput value={m.time} onChangeText={t => setMoments(moments.map((x, j) => (j === i ? { ...x, time: t } : x)))} placeholder="Time" placeholderTextColor={C.faint}
            style={{ width: 84, backgroundColor: C.card, borderWidth: 1, borderColor: '#E0D9CD', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, fontFamily: F.sans, color: C.ink }} />
          <Text style={{ flex: 1, fontFamily: F.sans, fontSize: 15, color: C.ink }}>{m.name}</Text>
          <Pressable onPress={() => setMoments(moments.filter((_, j) => j !== i))} hitSlop={10}><Text style={{ fontFamily: F.sansMedium, color: C.red }}>Remove</Text></Pressable>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}><Field value={newM} onChangeText={setNewM} placeholder="Add a moment, e.g. First dance" /></View>
        <Btn title="Add" kind="outline" onPress={() => { if (newM.trim()) { setMoments([...moments, { name: newM.trim(), time: '' }]); setNewM(''); } }} style={{ marginTop: 0 }} />
      </View>
      <Btn title="Create event wall" onPress={save} busy={busy} />
    </Screen>
  );
}
