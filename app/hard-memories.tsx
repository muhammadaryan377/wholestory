import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen, H1, H2, P, ToggleRow, Loading, Small, Field, Btn } from '@/components/ui';
import { addSkipDate, deleteSkipDate, listPeople, listSkipDates, listStories, me, setPersonHidden, updateStory, type Person, type SkipDate, type Story } from '@/lib/api';
import { C, F } from '@/lib/theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export default function HardMemories() {
  const [stories, setStories] = useState<Story[] | null>(null); const [people, setPeople] = useState<(Person & { hidden_from_memories?: boolean })[]>([]); const [dates, setDates] = useState<SkipDate[]>([]);
  const [d, setD] = useState(''); const [label, setLabel] = useState('');
  const load = useCallback(async () => {
    const u = await me(); setStories((await listStories()).filter(s => s.owner === u?.id)); setPeople(await listPeople()); setDates(await listSkipDates());
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const addDate = async () => {
    const m = d.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
    if (!m || +m[2] < 1 || +m[2] > 12 || +m[1] < 1 || +m[1] > 31) return Alert.alert('Check the date', 'Use day/month, for example 14/02.');
    await addSkipDate(+m[2], +m[1], label); setD(''); setLabel(''); load();
  };
  if (!stories) return <Loading />;
  return (
    <Screen>
      <H1>Hard memories</H1>
      <P muted style={{ marginBottom: 12 }}>Not every memory should come back. Choose what resurfaces in This day last year and reminders. Nothing is deleted.</P>
      <H2>People</H2>
      {!people.length ? <Small style={{ marginBottom: 10 }}>People you add appear here.</Small> : null}
      {people.map(p => <ToggleRow key={p.id} title={p.name} sub={p.hidden_from_memories ? 'Stories with them won’t come back' : 'Shown in memories'} value={!p.hidden_from_memories} onChange={async v => { await setPersonHidden(p.id, !v); load(); }} />)}
      <H2 style={{ marginTop: 10 }}>Dates</H2>
      <Small style={{ marginBottom: 8 }}>For anniversaries or days you’d rather not see. Nothing from these dates will come back.</Small>
      {dates.map(x => (
        <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 8 }}>
          <Text style={{ flex: 1, fontFamily: F.sansBold, color: C.ink }}>{x.day} {MONTHS[x.month - 1]}{x.label ? <Text style={{ fontFamily: F.sans, color: C.grey }}> · {x.label}</Text> : null}</Text>
          <Pressable onPress={async () => { await deleteSkipDate(x.id); load(); }} hitSlop={8}><Text style={{ color: C.red }}>Remove</Text></Pressable>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 0.5 }}><Field placeholder="dd/mm" value={d} onChangeText={setD} keyboardType="numbers-and-punctuation" /></View>
        <View style={{ flex: 1 }}><Field placeholder="Note (optional)" value={label} onChangeText={setLabel} /></View>
      </View>
      <Btn title="Skip this date" kind="outline" onPress={addDate} />
      <H2 style={{ marginTop: 10 }}>Stories</H2>
      {!stories.length ? <Small>Stories you create appear here.</Small> : null}
      {stories.map(s => <ToggleRow key={s.id} title={s.title} sub={s.hidden_from_memories ? 'Hidden from memories' : 'Shown in memories'} value={!s.hidden_from_memories} onChange={async v => { await updateStory(s.id, { hidden_from_memories: !v }); load(); }} />)}
    </Screen>
  );
}
