import { parseDate } from '@/lib/dates';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable, useWindowDimensions } from 'react-native';
import { Alert } from '@/lib/alert';
import { router, useFocusEffect, useLocalSearchParams, Stack } from 'expo-router';
import { LoadError, Screen, H2, Small, Card, Empty, Loading, ToggleRow, runAction } from '@/components/ui';
import { Photo } from '@/components/media';
import { Scrim } from '@/components/story-chrome';
import { Icon } from '@/components/icon';
import { deletePerson, getPerson, inviteCode, listPeople, photosInStories, setPersonHidden, type Person, type Story, type StoredPhoto } from '@/lib/api';
import { shareStoryInvite } from '@/lib/invite-actions';
import { openPhoto } from '@/lib/open';
import { C, F, S } from '@/lib/theme';

const AVATAR_TONES = ['#E6EFE9', '#FCEAE8', '#FBF1DF', '#E6EFFB'];

export default function PersonPage() {
  const [loadError, setLoadError] = useState('');
  const { id } = useLocalSearchParams<{ id: string }>();
  const [allPeople, setAllPeople] = useState<Person[]>([]);
  const [data, setData] = useState<{ person: Person & { hidden_from_memories?: boolean }; stories: Story[]; photos: (StoredPhoto & { story_id: string })[] } | null>(null);
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - S.pad * 2 - 12) / 3);

  const load = useCallback(async () => {
    try {
      setLoadError('');
      const [r, list] = await Promise.all([getPerson(id), listPeople().catch((): Person[] => [])]);
      setAllPeople(list);
      setData({ ...r, photos: await photosInStories(r.stories.map(s => s.id), 12) });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load. Please try again.');
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loadError) return <LoadError error={loadError} onRetry={load} />;
  if (!data) return <Loading />;

  const { person, stories, photos } = data;
  const since = stories.length ? parseDate(stories[0].story_date) : null;
  const years = since ? new Date().getFullYear() - since.getFullYear() : 0;
  const titleOf = (sid: string) => stories.find(s => s.id === sid)?.title;
  const del = () => Alert.alert(`Remove ${person.name}?`, 'Their page is removed. Your stories stay as they are.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => { await deletePerson(person.id); router.back(); } },
  ]);
  const invitePerson = async () => {
    const firstPublic = stories.find(s => !s.private);
    if (!firstPublic) {
      router.push({ pathname: '/story/new', params: { person: person.id } });
      return;
    }
    const code = await inviteCode(firstPublic.id);
    const outcome = await shareStoryInvite(firstPublic.title, code);
    if (outcome === 'copied') Alert.alert('Invitation copied', 'Paste this invitation into a message to ' + person.name + '.');
  };
  const hero = photos[0];

  return (
    <>
      <Stack.Screen options={{ title: '', headerRight: () => <Pressable onPress={del} hitSlop={12}><Text style={{ color: C.red, fontFamily: F.sansMedium }}>Remove</Text></Pressable> }} />
      <Screen>
        {allPeople.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -S.pad, marginBottom: 12 }} contentContainerStyle={{ paddingHorizontal: S.pad, gap: 14 }}>
            {allPeople.map((p, idx) => {
              const active = p.id === person.id;
              return (
                <Pressable key={p.id} onPress={() => { if (!active) router.replace(`/people/${p.id}`); }} style={{ alignItems: 'center', width: 62 }}>
                  <View style={[styles.avatarCircle, { backgroundColor: AVATAR_TONES[idx % AVATAR_TONES.length] }, active && styles.avatarCircleOn]}>
                    <Icon name="person" size={22} color={active ? '#D2382B' : C.navy} />
                  </View>
                  <Text style={[styles.avatarName, active && { fontFamily: F.sansBold, color: C.navy }]} numberOfLines={1}>{p.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.heroCard}>
          {hero ? (
            <View>
              <Photo path={hero.path} size={width} style={{ height: 210, width: '100%', borderRadius: 0 }} />
              <Scrim start={0.35} />
              <View style={styles.heroOverlay}>
                <Text style={styles.heroName}>{person.name}</Text>
                {person.relation || since ? (
                  <Text style={styles.heroSince}>{[person.relation, since ? `Together since ${since.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''].filter(Boolean).join(' · ')}</Text>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.heroEmpty}>
              <Text style={[styles.heroName, { color: C.navy }]}>{person.name}</Text>
              {person.relation || since ? <Small>{[person.relation, since ? `Since ${since.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''].filter(Boolean).join(' · ')}</Small> : null}
            </View>
          )}
          <View style={styles.statsBar}>
            <View style={styles.stat}><Text style={styles.statNum}>{stories.reduce((n, s) => n + (s.entryCount ?? 0), 0)}</Text><Small>memories</Small></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statNum}>{stories.length}</Text><Small>stories</Small></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statNum}>{years > 0 ? `${years} yrs` : '—'}</Text><Small>together</Small></View>
          </View>
        </View>

        {!stories.length ? <Empty title={`No stories with ${person.name} yet`} body="Open a story, tap ⋯ and choose “Who’s in this story?”." /> : null}
        {stories.length ? <H2>Firsts & milestones</H2> : null}
        {stories.slice(0, 5).map((s, i) => (
          <Card key={s.id} onPress={() => router.push(`/story/${s.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10 }}>
            {s.cover ? <Photo path={s.cover} size={52} /> : <View style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: '#E9E4D9' }} />}
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.serif, fontSize: 16, color: C.navy }}>{i === 0 ? 'First story together: ' : ''}{s.title}</Text>
              <Small>{parseDate(s.story_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Small>
            </View>
            <Icon name="forward" size={16} color={C.grey} />
          </Card>
        ))}

        {photos.length ? <H2 style={{ marginTop: 8 }}>Our memories</H2> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {photos.map(p => <Pressable key={p.id} onPress={() => openPhoto(p, p.story_id, titleOf(p.story_id))}><Photo path={p.path} size={tile} /></Pressable>)}
        </View>

        <View style={styles.bottomActions}>
          <Pressable onPress={() => router.push({ pathname: '/story/new', params: { person: person.id } })} style={styles.actionGreen}>
            <Icon name="image" size={18} color="#FFF" />
            <Text style={styles.actionGreenText}>Add a memory</Text>
          </Pressable>
          <Pressable onPress={() => runAction(invitePerson)} style={styles.actionSoft}>
            <Icon name="people" size={18} color={C.green} />
            <Text style={styles.actionSoftText}>Invite {person.name}</Text>
          </Pressable>
        </View>
        <Small style={{ textAlign: 'center', marginTop: 6, marginBottom: 12 }}>🔒 Private by default</Small>

        <ToggleRow title="Show in memories and reminders" sub={`Turn off to stop stories with ${person.name} coming back. Nothing is deleted.`} value={!person.hidden_from_memories}
          onChange={async v => { await setPersonHidden(person.id, !v); void load(); }} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  avatarCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  avatarCircleOn: { borderColor: '#D2382B' },
  avatarName: { fontFamily: F.sans, fontSize: 12, color: C.grey, marginTop: 4 },
  heroCard: { borderRadius: 18, overflow: 'hidden', backgroundColor: C.card, borderWidth: 1, borderColor: C.line, marginBottom: 14 },
  heroOverlay: { position: 'absolute', left: 14, bottom: 14 },
  heroEmpty: { padding: 18, backgroundColor: C.greenSoft },
  heroName: { fontFamily: F.serif, fontSize: 34, color: '#FFF' },
  heroSince: { fontFamily: F.sans, fontSize: 13, color: '#FFF', marginTop: 2 },
  statsBar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 28, backgroundColor: C.line },
  statNum: { fontFamily: F.serif, fontSize: 21, color: C.navy },
  bottomActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionGreen: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.green, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 10 },
  actionGreenText: { fontFamily: F.sansMedium, fontSize: 13.5, color: '#FFF' },
  actionSoft: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.greenSoft, borderRadius: 16, borderWidth: 1, borderColor: '#C9DBC4', paddingVertical: 13, paddingHorizontal: 10 },
  actionSoftText: { fontFamily: F.sansMedium, fontSize: 13.5, color: C.green },
});
