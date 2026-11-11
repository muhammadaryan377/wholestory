import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useFocusResource } from '@/lib/use-focus-resource';
import { dateRange } from '@/lib/dates';
import { LoadError, Screen, H1, P, Small, Empty, Loading, Chip } from '@/components/ui';
import { BrandHeader, SearchBar } from '@/components/story-chrome';
import { Icon } from '@/components/icon';
import { listEvents, type EventRow } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { eventUrl } from '@/lib/media';
import { C, F, S } from '@/lib/theme';

type EventTab = 'upcoming' | 'past' | 'mine' | 'closed';
const EVENT_KINDS = ['All', 'Wedding', 'Birthday', 'Holiday', 'Family gathering', 'Graduation', 'Other'] as const;
const TABS: { key: EventTab; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'mine', label: 'My events' },
  { key: 'closed', label: 'Closed' },
];

export default function Events() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const { data: events, error, reload } = useFocusResource(listEvents);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<string>('All');
  const [showFilters, setShowFilters] = useState(false);
  const [tab, setTab] = useState<EventTab>('upcoming');

  const todayIso = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    const list = events ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((e: EventRow) => {
      if (kind !== 'All' && e.kind !== kind) return false;
      if (q && ![e.name, e.place, e.kind].some(v => v?.toLowerCase().includes(q))) return false;
      const endRef = e.ends_on ?? e.starts_on;
      if (tab === 'upcoming') return e.is_open && (!endRef || endRef >= todayIso);
      if (tab === 'past') return !!endRef && endRef < todayIso;
      if (tab === 'mine') return !uid || e.host === uid;
      if (tab === 'closed') return !e.is_open;
      return true;
    });
  }, [events, search, kind, tab, uid, todayIso]);

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!events) return <Loading />;

  return (
    <Screen style={{ paddingTop: 8, paddingBottom: 28 }}>
      <BrandHeader />
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search by event, place or keyword…"
        onFilter={() => setShowFilters(v => !v)} filterOn={showFilters} filterLabel="Filter events by type" />

      {showFilters ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bleed} contentContainerStyle={styles.bleedRow}>
          {EVENT_KINDS.map(k => <Chip key={k} label={k} on={kind === k} onPress={() => setKind(k)} />)}
        </ScrollView>
      ) : null}

      <View style={styles.headingRow}>
        <View style={{ flex: 1 }}>
          <H1 style={{ marginBottom: 2 }}>Events wall</H1>
          <P muted>Life’s moments, all in one place.</P>
        </View>
        <Pressable onPress={() => router.push('/event/new')} style={styles.createPill} accessibilityRole="button">
          <Icon name="plus" size={16} color="#FFF" />
          <Text style={styles.createPillText}>Create event</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {TABS.map(item => (
          <Pressable key={item.key} onPress={() => setTab(item.key)} style={[styles.tab, tab === item.key && styles.tabOn]}>
            <Text style={[styles.tabText, tab === item.key && styles.tabTextOn]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {!events.length ? (
        <Empty title="No events yet" body="Create a wall for a wedding, birthday or trip. Guests add photos and stories with a link or QR code, no app needed."
          action="Create an event wall" onAction={() => router.push('/event/new')} />
      ) : !filtered.length ? (
        <View style={styles.emptyFilter}>
          <Text style={styles.emptyTitle}>No {tab === 'closed' ? 'closed' : tab} events</Text>
          <Small style={{ textAlign: 'center', marginTop: 4 }}>Try another tab or create a new event wall above.</Small>
        </View>
      ) : (
        filtered.map(e => (
          <Pressable key={e.id} onPress={() => router.push(`/event/${e.id}`)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
            {e.cover_path ? <Image source={{ uri: eventUrl(e.cover_path) }} style={styles.thumb} contentFit="cover" />
              : <View style={[styles.thumb, { backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' }]}><Icon name="calendar" size={24} color={C.green} /></View>}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.eventName} numberOfLines={1}>{e.name}</Text>
              <Small numberOfLines={1}>
                {[dateRange(e.starts_on, e.ends_on), e.place].filter(Boolean).join(' · ') || e.kind}{e.is_open ? '' : ' · Wall closed'}
              </Small>
            </View>
            <Icon name="forward" size={18} color={C.grey} />
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bleed: { marginHorizontal: -S.pad, marginBottom: 6 },
  bleedRow: { paddingHorizontal: S.pad },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 12 },
  createPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.green, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10 },
  createPillText: { fontFamily: F.sansMedium, fontSize: 13.5, color: '#FFF' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: C.line, marginBottom: 12 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderColor: 'transparent' },
  tabOn: { borderColor: C.green },
  tabText: { fontFamily: F.sansMedium, fontSize: 13.5, color: C.grey },
  tabTextOn: { fontFamily: F.sansBold, fontSize: 13.5, color: C.navy },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 10 },
  thumb: { width: 62, height: 62, borderRadius: 12 },
  eventName: { fontFamily: F.serif, fontSize: 18.5, color: C.navy, marginBottom: 2 },
  emptyFilter: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 20, alignItems: 'center', marginTop: 8 },
  emptyTitle: { fontFamily: F.serif, fontSize: 19, color: C.navy },
});
