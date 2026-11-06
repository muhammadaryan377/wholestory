import { parseDate } from '@/lib/dates';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/typography';
import { Alert } from '@/lib/alert';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { LoadError, Screen, H1, H2, P, Field, Btn, Small, Chip, Loading } from '@/components/ui';
import { addMoment, deleteMoment, getEvent, updateMoment, type EventRow, type Moment } from '@/lib/api';
import { C, F } from '@/lib/theme';

/** The event's moments with times: the sections of the wall, shown to guests too. */
export default function Schedule() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ev, setEv] = useState<EventRow | null>(null); const [moments, setMoments] = useState<Moment[]>([]);
  const [name, setName] = useState(''); const [time, setTime] = useState(''); const [day, setDay] = useState(1);
  const [editing, setEditing] = useState<string | null>(null); const [eName, setEName] = useState(''); const [eTime, setETime] = useState('');
  const [loadError, setLoadError] = useState('');
  const load = useCallback(async () => {
    try { setLoadError(''); const r = await getEvent(id); setEv(r.ev); setMoments(r.moments); } catch (e) { setLoadError(e instanceof Error ? e.message : 'Could not load.'); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (loadError) return <LoadError error={loadError} onRetry={load} />;
  if (!ev) return <Loading />;
  const days = ev.starts_on && ev.ends_on ? Math.max(1, Math.round((parseDate(ev.ends_on).getTime() - parseDate(ev.starts_on).getTime()) / 864e5) + 1) : 1;
  const dayLabel = (d: number) => { if (!ev.starts_on) return `Day ${d}`; const x = parseDate(ev.starts_on); x.setDate(x.getDate() + d - 1); return x.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); };
  const add = async () => { if (!name.trim()) return Alert.alert('Name the moment', 'For example “First dance”.'); await addMoment(ev.id, { day, time_label: time.trim(), name: name.trim() }); setName(''); setTime(''); load(); };
  return (
    <Screen>
      <H1>Schedule</H1>
      <P muted style={{ marginBottom: 12 }}>Moments are the sections of your wall, like Ceremony or Dinner. Guests choose one when they add.</P>
      {Array.from({ length: days }).map((_, i) => {
        const list = moments.filter(m => m.day === i + 1);
        return (
          <View key={i}>
            <H2>{dayLabel(i + 1)}</H2>
            {!list.length ? <Small style={{ marginBottom: 8 }}>No moments on this day yet.</Small> : null}
            {list.map(m => editing === m.id ? (
              <View key={m.id} style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 10, marginBottom: 8 }}>
                <Field label="Time" value={eTime} onChangeText={setETime} placeholder="e.g. 3:00 PM" />
                <Field label="Name" value={eName} onChangeText={setEName} />
                <Btn title="Save" onPress={async () => { await updateMoment(m.id, { name: eName.trim() || m.name, time_label: eTime.trim() }); setEditing(null); load(); }} />
              </View>
            ) : (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 8 }}>
                <Text style={{ width: 76, fontFamily: F.sansBold, color: C.green }}>{m.time_label || '—'}</Text>
                <Text style={{ flex: 1, fontFamily: F.serif, fontSize: 16, color: C.navy }}>{m.name}</Text>
                <Pressable onPress={() => { setEditing(m.id); setEName(m.name); setETime(m.time_label ?? ''); }} hitSlop={8}><Text style={{ color: C.green, marginRight: 14 }}>Edit</Text></Pressable>
                <Pressable onPress={() => Alert.alert(`Remove ${m.name}?`, 'Photos in this moment stay on the wall under “Other”.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => { await deleteMoment(m.id); load(); } }])} hitSlop={8}><Text style={{ color: C.red }}>Remove</Text></Pressable>
              </View>
            ))}
          </View>
        );
      })}
      <H2 style={{ marginTop: 8 }}>Add a moment</H2>
      {days > 1 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{Array.from({ length: days }).map((_, i) => <Chip key={i} label={dayLabel(i + 1)} on={day === i + 1} onPress={() => setDay(i + 1)} />)}</View> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 0.45 }}><Field label="Time" value={time} onChangeText={setTime} placeholder="8:30 PM" /></View>
        <View style={{ flex: 1 }}><Field label="Moment" value={name} onChangeText={setName} placeholder="e.g. First dance" /></View>
      </View>
      <Btn title="Add moment" onPress={add} />
    </Screen>
  );
}
