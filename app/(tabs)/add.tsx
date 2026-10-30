import { router } from 'expo-router';
import { Screen, H1, P, Card, Small } from '@/components/ui';
import { Text } from 'react-native';
import { C, F } from '@/lib/theme';

const Option = ({ title, sub, onPress }: { title: string; sub: string; onPress: () => void }) => (
  <Card onPress={onPress}><Text style={{ fontFamily: F.serif, fontSize: 18, color: C.navy }}>{title}</Text><Small>{sub}</Small></Card>
);
export default function Add() {
  return (
    <Screen>
      <H1>Add to Wholestory</H1>
      <P muted style={{ marginBottom: 14 }}>What would you like to keep?</P>
      <Option title="A new story" sub="Choose photos and tell what happened, by voice or in writing." onPress={() => router.push('/story/new')} />
      <Option title="Tell the whole story" sub="Choose photos from a trip or day, talk through it once, and each part is pinned to its photo." onPress={() => router.push('/story/tell')} />
      <Option title="Add to a story" sub="Add new photos or a new chapter to a story you already have." onPress={() => router.push('/(tabs)/stories')} />
      <Option title="A quick voice story" sub="What made today special? Say it in a few seconds." onPress={() => router.push({ pathname: '/story/new', params: { quick: '1' } })} />
      <Option title="An event wall" sub="For a wedding, birthday or trip. Guests add photos with a link or QR code." onPress={() => router.push('/event/new')} />
    </Screen>
  );
}
