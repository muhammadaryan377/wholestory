import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Alert } from '@/lib/alert';
import { Screen, H1, P, Field, Btn, Small } from '@/components/ui';
import { Icon } from '@/components/icon';
import { createEvent } from '@/lib/api';
import { dateInput } from '@/lib/dates';
import { useUnsavedGuard } from '@/lib/use-unsaved-guard';
import { C, F } from '@/lib/theme';

const DOT_COLORS = ['#F5A623', '#1D6FF2', '#2F9E6B', '#E8402B'];
const EVENT_TYPES = [
  { key: 'Wedding', label: 'Wedding', image: require('../../assets/onboarding/timeline_engagement.jpg') },
  { key: 'Birthday', label: 'Birthday', image: require('../../assets/onboarding/timeline_dinner.jpg') },
  { key: 'Holiday', label: 'Holiday', image: require('../../assets/onboarding/timeline_greece.jpg') },
  { key: 'Family gathering', label: 'Family gathering', image: require('../../assets/onboarding/collab_dinner.jpg') },
  { key: 'Graduation', label: 'Graduation', image: require('../../assets/onboarding/collab_friends.jpg') },
  { key: 'Other', label: 'Other', image: require('../../assets/onboarding/collab_outdoors.jpg') },
] as const;

type MomentDraft = { day: number; name: string; time: string };
const mk = (xs: [string, string][], day = 1): MomentDraft[] => xs.map(([time, name]) => ({ day, time, name }));
const DEFAULTS: Record<string, MomentDraft[]> = {
  Wedding: mk([['10:00 AM', 'Getting ready'], ['1:00 PM', 'Ceremony'], ['5:00 PM', 'Dinner & speeches'], ['8:00 PM', 'Dancing']]),
  Birthday: mk([['6:00 PM', 'Arrivals'], ['7:30 PM', 'Cake'], ['9:00 PM', 'Party']]),
  Holiday: mk([['9:00 AM', 'Day 1'], ['9:00 AM', 'Day 2'], ['9:00 AM', 'Day 3']]),
  'Family gathering': mk([['12:00 PM', 'Arrivals'], ['2:00 PM', 'Meal'], ['4:00 PM', 'Games']]),
  Graduation: mk([['10:00 AM', 'Ceremony'], ['1:00 PM', 'Celebration']]),
  Other: mk([['', 'Arrivals'], ['', 'Highlights']]),
};

export default function NewEvent() {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [kind, setKind] = useState('Wedding');
  const [name, setName] = useState('');
  const [place, setPlace] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [multiDay, setMultiDay] = useState(false);
  const [timelineMode, setTimelineMode] = useState<'suggested' | 'custom'>('suggested');
  const [moments, setMoments] = useState<MomentDraft[]>(DEFAULTS.Wedding);
  const [newM, setNewM] = useState('');
  const [cover, setCoverUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const allowExit = useUnsavedGuard(!busy && (!!name.trim() || !!place.trim() || !!cover));
  const iso = dateInput;

  const pickCover = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [16, 9] });
    if (!r.canceled) setCoverUri(r.assets[0].uri);
  };

  const selectType = (key: string) => {
    setKind(key);
    if (timelineMode === 'suggested') setMoments(DEFAULTS[key] ?? DEFAULTS.Other);
  };

  const nextFromDetails = () => {
    if (!name.trim()) return Alert.alert('Name your event', 'For example “Maya & Tom’s Wedding”.');
    if (start && !iso(start)) return Alert.alert('Check the start date', 'Use day/month/year, e.g. 15/09/2026.');
    if (multiDay && end && !iso(end)) return Alert.alert('Check the end date', 'Enter a valid day/month/year.');
    if (multiDay && end && !start) return Alert.alert('Add a start date', 'Choose the start date before the end date.');
    if (multiDay && start && end && iso(end)! < iso(start)!) return Alert.alert('Check the dates', 'The end date cannot be before the start date.');
    setStep(2);
  };

  const save = async () => {
    if (busy) return;
    if (!name.trim()) return Alert.alert('Name your event', 'For example “Maya & Tom’s Wedding”.');
    setBusy(true);
    try {
      const endIso = multiDay ? (iso(end) ?? iso(start)) : iso(start);
      const id = await createEvent(
        { name: name.trim(), kind, place: place.trim(), starts_on: iso(start), ends_on: endIso },
        moments.map(m => ({ day: m.day, time_label: m.time.trim(), name: m.name })),
        cover,
      );
      allowExit();
      router.replace(`/event/${id}`);
    } catch (e: any) {
      Alert.alert('Could not create', e.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {step === 0 ? (
        <>
          <H1 style={{ textAlign: 'center' }}>Create an event wall</H1>
          <P muted style={{ textAlign: 'center', marginBottom: 16 }}>
            Bring everyone’s photos, memories and moments together in one place.
          </P>
          <View style={styles.typeGrid}>
            {EVENT_TYPES.map(t => {
              const active = kind === t.key;
              return (
                <Pressable key={t.key} onPress={() => selectType(t.key)} style={[styles.typeCard, active && styles.typeCardOn]}>
                  <Image source={t.image} style={styles.typeImg} contentFit="cover" />
                  <View style={styles.typeLabelWrap}>
                    <Text style={[styles.typeLabel, active && { color: C.green }]}>{t.label}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Btn title="Next  ›" onPress={() => setStep(1)} style={{ marginTop: 14 }} />
        </>
      ) : null}

      {step === 1 ? (
        <>
          <H1 style={{ textAlign: 'center' }}>Add event details</H1>
          <P muted style={{ textAlign: 'center', marginBottom: 14 }}>
            Give your event a name and add the key details.
          </P>
          <Pressable onPress={pickCover} accessibilityLabel="Choose a cover photo" style={{ marginBottom: 14 }}>
            {cover ? (
              <View>
                <Image source={{ uri: cover }} style={{ width: '100%', height: 176, borderRadius: 16 }} contentFit="cover" />
                <View style={styles.coverBadge}><Icon name="camera" size={14} color="#FFF" /><Text style={styles.coverBadgeText}>Change cover</Text></View>
              </View>
            ) : (
              <View style={styles.coverEmpty}>
                <Icon name="camera" size={24} color={C.green} />
                <Text style={{ fontFamily: F.sansMedium, color: C.green, marginTop: 6 }}>Add a cover photo</Text>
                <Small>Guests see it at the top of the wall</Small>
              </View>
            )}
          </Pressable>
          <Field label="Event name" value={name} onChangeText={setName} placeholder="e.g. Maya & Tom’s Wedding" />
          <Field label="Location" value={place} onChangeText={setPlace} placeholder="e.g. Lake Como, Italy" />
          <Field label="Start date" value={start} onChangeText={setStart} placeholder="dd/mm/yyyy" keyboardType="numbers-and-punctuation" />
          {multiDay ? <Field label="End date" value={end} onChangeText={setEnd} placeholder="dd/mm/yyyy" keyboardType="numbers-and-punctuation" /> : null}
          <View style={styles.multiRow}>
            <Text style={styles.multiLabel}>Multi-day event</Text>
            <Switch value={multiDay} onValueChange={setMultiDay} trackColor={{ true: C.green }} />
          </View>
          <Btn title="Next  ›" onPress={nextFromDetails} style={{ marginTop: 14 }} />
          <Btn title="Back" kind="link" onPress={() => setStep(0)} />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <H1 style={{ textAlign: 'center' }}>Add your timeline</H1>
          <P muted style={{ textAlign: 'center', marginBottom: 14 }}>
            Add the key moments for your event. You can edit or reorder these later.
          </P>

          <View style={styles.modeSwitch}>
            <Pressable onPress={() => { setTimelineMode('suggested'); setMoments(DEFAULTS[kind] ?? DEFAULTS.Other); }}
              style={[styles.modeBtn, timelineMode === 'suggested' && styles.modeBtnOn]}>
              <Text style={[styles.modeText, timelineMode === 'suggested' && styles.modeTextOn]}>Suggested</Text>
            </Pressable>
            <Pressable onPress={() => { setTimelineMode('custom'); setMoments([]); }}
              style={[styles.modeBtn, timelineMode === 'custom' && styles.modeBtnOn]}>
              <Text style={[styles.modeText, timelineMode === 'custom' && styles.modeTextOn]}>Custom</Text>
            </Pressable>
          </View>

          <Text style={styles.dayHeading}>Day 1{start ? ` · ${start}` : ''}</Text>
          {moments.map((m, i) => (
            <View key={`${m.name}-${i}`} style={styles.momentRow}>
              <View style={[styles.dot, { backgroundColor: DOT_COLORS[i % DOT_COLORS.length] }]} />
              <View style={{ flex: 1 }}>
                <TextInput value={m.time} onChangeText={t => setMoments(moments.map((x, j) => j === i ? { ...x, time: t } : x))}
                  placeholder="Time (e.g. 10:00 AM)" placeholderTextColor={C.faint} style={styles.timeInput} />
                <TextInput value={m.name} onChangeText={t => setMoments(moments.map((x, j) => j === i ? { ...x, name: t } : x))}
                  placeholder="Moment title" placeholderTextColor={C.faint} style={styles.nameInput} />
              </View>
              <Pressable onPress={() => setMoments(moments.filter((_, j) => j !== i))} hitSlop={10} accessibilityLabel="Remove moment">
                <Icon name="trash" size={18} color={C.grey} />
              </Pressable>
            </View>
          ))}

          <View style={styles.addRow}>
            <TextInput value={newM} onChangeText={setNewM} placeholder="Add another moment (e.g. First dance)"
              placeholderTextColor={C.faint} style={styles.addInput} />
            <Pressable onPress={() => { if (newM.trim()) { setMoments([...moments, { day: 1, name: newM.trim(), time: '' }]); setNewM(''); } }} style={styles.addBtn}>
              <Icon name="plus" size={16} color="#FFF" />
              <Text style={styles.addBtnText}>Add</Text>
            </Pressable>
          </View>

          <Btn title={busy ? 'Creating…' : 'Create event wall  ›'} onPress={save} busy={busy} style={{ marginTop: 14 }} />
          <Btn title="Back" kind="link" onPress={() => setStep(1)} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeCard: { width: '48.2%', borderRadius: 16, overflow: 'hidden', backgroundColor: C.card, borderWidth: 2, borderColor: C.line },
  typeCardOn: { borderColor: C.green },
  typeImg: { width: '100%', height: 104 },
  typeLabelWrap: { paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#FAF2E6', alignItems: 'center' },
  typeLabel: { fontFamily: F.serif, fontSize: 16, color: C.navy },
  coverEmpty: { height: 132, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#CFC8BA', alignItems: 'center', justifyContent: 'center', backgroundColor: C.card },
  coverBadge: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(15,27,51,0.72)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  coverBadgeText: { fontFamily: F.sansMedium, fontSize: 12, color: '#FFF' },
  multiRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 10, marginTop: 4 },
  multiLabel: { fontFamily: F.sansMedium, fontSize: 14.5, color: C.navy },
  modeSwitch: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  modeBtn: { flex: 1, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingVertical: 10, alignItems: 'center' },
  modeBtnOn: { backgroundColor: C.green, borderColor: C.green },
  modeText: { fontFamily: F.sansMedium, fontSize: 13.5, color: C.navy },
  modeTextOn: { color: '#FFF' },
  dayHeading: { fontFamily: F.serif, fontSize: 18, color: C.navy, marginBottom: 8 },
  momentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  timeInput: { fontFamily: F.sans, fontSize: 11.5, color: C.grey, padding: 0, marginBottom: 2 },
  nameInput: { fontFamily: F.serif, fontSize: 16, color: C.navy, padding: 0 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 },
  addInput: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontFamily: F.sans, fontSize: 14, color: C.ink },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.green, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 11 },
  addBtnText: { fontFamily: F.sansMedium, fontSize: 13, color: '#FFF' },
});
