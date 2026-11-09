import { router } from 'expo-router';
import { Screen, H1, P } from '@/components/ui';
import { BrandHeader } from '@/components/story-chrome';
import { SettingsGroup, SettingsRow } from '@/components/settings-rows';

export default function Add() {
  return (
    <Screen style={{ paddingTop: 8, paddingBottom: 28 }}>
      <BrandHeader />
      <H1>Add to Whole Story</H1>
      <P muted>What would you like to keep?</P>
      <SettingsGroup>
        <SettingsRow icon="image" title="A new story" sub="Choose photos and tell what happened, by voice or in writing." onPress={() => router.push('/story/new')} />
        <SettingsRow icon="book" title="Tell the whole story" sub="Choose photos from a trip or day, talk through it once, and each part is pinned to its photo." onPress={() => router.push('/story/tell')} />
        <SettingsRow icon="stack" title="Add to a story" sub="Add new photos or a new chapter to a story you already have." onPress={() => router.navigate('/(tabs)/stories')} />
        <SettingsRow icon="mic" title="A quick voice story" sub="What made today special? Say it in a few seconds." onPress={() => router.push({ pathname: '/story/new', params: { quick: '1' } })} />
        <SettingsRow icon="calendar" title="An event wall" sub="For a wedding, birthday or trip. Guests add photos with a link or QR code." onPress={() => router.push('/event/new')} />
      </SettingsGroup>
    </Screen>
  );
}
