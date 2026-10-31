import { useFocusResource } from '@/lib/use-focus-resource';
import { dateRange } from '@/lib/dates';

import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { LoadError, Screen, H1, P, Card, Small, Empty, Btn, Loading } from '@/components/ui';
import { listEvents } from '@/lib/api';
import { Image } from 'expo-image';
import { eventUrl } from '@/lib/media';
import { C, F } from '@/lib/theme';

export default function Events() {
  const { data: events, error, reload } = useFocusResource(listEvents);

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!events) return <Loading />;
  return (
    <Screen>
      <H1>Events wall</H1>
      <P muted style={{ marginBottom: 12 }}>Life’s moments, all in one place.</P>
      {events.length ? <Btn title="Create an event wall" onPress={() => router.push('/event/new')} /> : null}
      {!events.length ? <Empty title="No events yet" body="Create a wall for a wedding, birthday or trip. Guests add photos and stories with a link or QR code, no app needed." action="Create an event wall" onAction={() => router.push('/event/new')} /> : null}
      {events.map(e => (
        <Card key={e.id} onPress={() => router.push(`/event/${e.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {e.cover_path ? <Image source={{ uri: eventUrl(e.cover_path) }} style={{ width: 64, height: 64, borderRadius: 12 }} contentFit="cover" /> : <View style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: C.greenSoft }} />}
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.serif, fontSize: 19, color: C.navy }}>{e.name}</Text>
            <Small>{[dateRange(e.starts_on, e.ends_on), e.place].filter(Boolean).join(' · ')}{e.is_open ? '' : ' · Wall closed'}</Small>
          </View>
          <Text style={{ color: C.faint, fontSize: 20 }}>›</Text>
        </Card>
      ))}
    </Screen>
  );
}
