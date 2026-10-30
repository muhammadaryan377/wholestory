import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Screen, H1, P, Btn, Thread } from '@/components/ui';
import { C, F } from '@/lib/theme';

const PAGES = [
  ['A moment. A snapshot. A memory.', 'Capture your story and watch it grow.'],
  ['Your photos show a moment.', 'Wholestory keeps the memories, voices and moments behind them.'],
  ['A story doesn’t end with one photo.', 'Add new moments over time and watch your story grow.'],
  ['Tell us why it mattered.', 'Just tap and talk. Your memories, in your own words.'],
  ['More than your perspective.', 'Invite the people who were there to add their photos and stories too.'],
];
export default function Welcome() {
  const [i, setI] = useState(0);
  const last = i === PAGES.length - 1;
  return (
    <Screen scroll={false} style={{ justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center', marginTop: 40 }}>
        <Text style={{ fontFamily: F.serif, fontSize: 44, color: C.navy }}>Wholestory</Text>
        <Thread width={200} />
        <Text style={{ fontFamily: F.serifRegular, fontSize: 16, color: C.grey, marginTop: 6 }}>Keep the whole story.</Text>
      </View>
      <View>
        <H1 style={{ fontSize: 32 }}>{PAGES[i][0]}</H1>
        <P muted style={{ fontSize: 16 }}>{PAGES[i][1]}</P>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 16 }}>
          {PAGES.map((_, j) => <Pressable key={j} onPress={() => setI(j)} style={{ width: j === i ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: j === i ? C.green : '#D8D2C6' }} />)}
        </View>
      </View>
      <View>
        <Btn title={last ? 'Begin your story' : 'Next'} onPress={() => (last ? router.push('/sign-up') : setI(i + 1))} />
        <Btn kind="link" title="Already have an account? Log in" onPress={() => router.push('/sign-in')} />
      </View>
    </Screen>
  );
}
