import { useFocusResource } from '@/lib/use-focus-resource';
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/typography';
import { Alert } from '@/lib/alert';
import { router } from 'expo-router';
import { LoadError, Screen, H1, P, Card, Small, Empty, Field, Btn, Loading } from '@/components/ui';
import { addPerson, listPeople } from '@/lib/api';
import { C, F } from '@/lib/theme';

export default function People() {
  const { data: people, error, reload: load } = useFocusResource(listPeople); const [name, setName] = useState(''); const [rel, setRel] = useState(''); const [adding, setAdding] = useState(false);
  const add = async () => { if (!name.trim()) return Alert.alert('Add a name first'); await addPerson(name, rel); setName(''); setRel(''); setAdding(false); load(); };
  if (error) return <LoadError error={error} onRetry={load} />;
  if (!people) return <Loading />;
  return (
    <Screen>
      <H1>People</H1>
      <P muted style={{ marginBottom: 12 }}>Each person gets a page with all your memories together. Add who’s in a story from its ⋯ menu.</P>
      {adding ? (<Card>
        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Alex" />
        <Field label="Who they are to you (optional)" value={rel} onChangeText={setRel} placeholder="e.g. partner, mum, best friend" />
        <Btn title="Add person" onPress={add} /><Btn kind="link" title="Cancel" onPress={() => setAdding(false)} />
      </Card>) : <Btn title="Add a person" kind="outline" onPress={() => setAdding(true)} />}
      {!people.length && !adding ? <Empty title="No People Pages yet" body="Add the people who matter, then tag them in your stories." /> : null}
      {people.map(p => (
        <Card key={p.id} onPress={() => router.push(`/people/${p.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: F.serif, fontSize: 20, color: C.green }}>{p.name[0]?.toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}><Text style={{ fontFamily: F.serif, fontSize: 18, color: C.navy }}>{p.name}</Text><Small>{[p.relation, `${p.storyCount ?? 0} ${p.storyCount === 1 ? 'story' : 'stories'} together`].filter(Boolean).join(' · ')}</Small></View>
          <Text style={{ color: C.faint, fontSize: 20 }}>›</Text>
        </Card>
      ))}
    </Screen>
  );
}
