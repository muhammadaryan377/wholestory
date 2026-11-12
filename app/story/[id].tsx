import { parseDate } from '@/lib/dates';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Alert } from '@/lib/alert';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { shareStoryInvite, copyStoryInvite } from '@/lib/invite-actions';
import { Btn, Card, Chip, Empty, Field, H1, LoadError, Loading, P, Screen, Small, Thread, runAction } from '@/components/ui';
import { Photo, VoicePlayer } from '@/components/media';
import { Icon } from '@/components/icon';
import { Comments } from '@/components/comments';
import { backToStories, CATEGORY_TAGS, Scrim } from '@/components/story-chrome';
import { StoryLocationPicker } from '@/components/story-location';
import { openPhoto } from '@/lib/open';
import { addPerson, deleteEntry, deleteStory, getStory, inviteCode, listPeople, me, peopleInStory, setPeopleInStory, updateStory, type Entry, type Person, type Story } from '@/lib/api';
import { placeDetails, type PlaceDetail } from '@/lib/places';
import { splitStoryMoments, type StoryMoment } from '@/lib/moment-splits';
import { PrivateLockedError, usePrivateUnlocked } from '@/lib/private-access';
import { clearStoryLocation, getStoryPreferences, saveStoryPreference, type StoryCategory, type StoryLocation } from '@/lib/story-preferences';
import { toggleVoiceFavourite, voiceFavouriteIds } from '@/lib/voice-favourites';
import { C, F, S } from '@/lib/theme';

type DetailTab = 'moments' | 'photos' | 'map' | 'people';

export default function StoryScreen() {
  const { width } = useWindowDimensions();
  const [loadError, setLoadError] = useState('');
  const { id } = useLocalSearchParams<{ id: string }>();
  const unlocked = usePrivateUnlocked();
  const [data, setData] = useState<{ story: Story; entries: Entry[] } | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [storyPlace, setStoryPlace] = useState<StoryLocation | null>(null);
  const [storyCategory, setStoryCategory] = useState<StoryCategory | undefined>(undefined);
  const [storyTags, setStoryTags] = useState<string[]>([]);
  const [coverOverride, setCoverOverride] = useState<string | undefined>(undefined);
  const [photoDetails, setPhotoDetails] = useState<Record<string, PlaceDetail>>({});
  const [storyCountry, setStoryCountry] = useState<string>('');
  const [tab, setTab] = useState<DetailTab>('moments');
  const [activeMomentId, setActiveMomentId] = useState<string | null>(null);
  const [pickingCover, setPickingCover] = useState(false);
  const [voiceFavourites, setVoiceFavourites] = useState<string[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [tagged, setTagged] = useState<string[]>([]);
  const [tagging, setTagging] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirmingEntryId, setConfirmingEntryId] = useState<string | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [entryDeleteError, setEntryDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoadError('');
      setData(await getStory(id));
      const user = await me();
      setUid(user?.id ?? null);
      if (user) {
        const pref = await getStoryPreferences(user.id);
        setStoryPlace(pref[id]?.location ?? null);
        setStoryCategory(pref[id]?.category);
        setStoryTags(pref[id]?.tags ?? []);
        setCoverOverride(pref[id]?.coverPath);
        setVoiceFavourites(await voiceFavouriteIds(user.id));
      }
      setPeople(await listPeople());
      setTagged(await peopleInStory(id));
    } catch (e) {
      if (e instanceof PrivateLockedError) router.replace('/private');
      else setLoadError(e instanceof Error ? e.message : 'Could not load this story.');
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const allPhotos = useMemo(() => (data?.entries ?? []).flatMap(e => e.photos), [data]);
  const geoPhotos = useMemo(() => allPhotos.filter(p => p.lat != null && p.lng != null), [allPhotos]);

  useEffect(() => {
    let active = true;
    const points = [
      ...geoPhotos.map(p => ({ id: p.id, lat: p.lat!, lng: p.lng! })),
      ...(storyPlace ? [{ id: '__story__', lat: storyPlace.lat, lng: storyPlace.lng }] : []),
    ];
    placeDetails(points).then(resolved => {
      if (!active) return;
      setPhotoDetails(resolved);
      const primary = resolved.__story__ ?? Object.values(resolved)[0];
      setStoryCountry(primary?.country ?? primary?.label ?? '');
    }).catch(() => {});
    return () => { active = false; };
  }, [geoPhotos, storyPlace]);

  const photoLabels = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(photoDetails)) out[k] = v.label;
    return out;
  }, [photoDetails]);

  const moments = useMemo(
    () => splitStoryMoments(data?.entries ?? [], photoLabels, data?.story.title ?? 'Moment'),
    [data, photoLabels],
  );
  const activeMoment = useMemo<StoryMoment | null>(
    () => moments.find(m => m.id === activeMomentId) ?? null,
    [moments, activeMomentId],
  );
  const placeBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of geoPhotos) {
      const label = photoLabels[p.id];
      if (!label) continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [geoPhotos, photoLabels]);

  if (loadError) return <LoadError error={loadError} onRetry={load} />;
  if (!data) return <Loading />;

  const { story, entries } = data;
  if (story.private && !unlocked) return <Screen><H1>Private story</H1><Btn title="Unlock Private albums" onPress={() => router.replace('/private')} /></Screen>;

  const owner = uid === story.owner;
  const heroCover = coverOverride ?? story.cover ?? allPhotos[0]?.path ?? null;
  const photoTile = Math.floor((width - S.pad * 2 - 12) / 3);
  const taggedPeople = people.filter(p => tagged.includes(p.id));
  const ownerName = entries.find(e => e.author === story.owner)?.author_name ?? '';
  const storyDateText = parseDate(story.story_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const locationPillLabel = storyCountry || (storyPlace || geoPhotos.length ? 'Location added' : '');
  const featuredMoment = moments[0] ?? null;
  const gridMoments = moments.slice(1);
  const momentCardWidth = Math.floor((width - S.pad * 2 - 12) / 2);

  const invite = async () => {
    const code = await inviteCode(story.id);
    const outcome = await shareStoryInvite(story.title, code);
    if (outcome === 'copied') Alert.alert('Invitation copied', 'Sharing isn’t available here, so the invitation was copied. Paste it into any messaging app.');
  };
  const copyInvite = async () => {
    const code = await inviteCode(story.id);
    await copyStoryInvite(code);
    Alert.alert('Link copied', 'You can paste this invitation into any messaging app.');
  };
  const updatePlace = async (next: StoryLocation | null) => {
    if (!uid || !data || data.story.private) return;
    try {
      if (next) await saveStoryPreference(uid, data.story.id, { location: next });
      else await clearStoryLocation(uid, data.story.id);
      setStoryPlace(next);
    } catch (error) {
      Alert.alert('Could not save location', error instanceof Error ? error.message : 'Try again.');
    }
  };
  const pickStoryCover = async (path: string) => {
    if (!uid) return;
    await saveStoryPreference(uid, story.id, { coverPath: path });
    setCoverOverride(path);
    setPickingCover(false);
  };
  const renameStory = () => {
    if (!owner) return;
    Alert.prompt?.('Rename story', '', async t => { if (t?.trim()) { await updateStory(story.id, { title: t.trim() }); void load(); } }, 'plain-text', story.title);
  };
  const options = () => {
    const items = ['Invite contributors', 'Copy invite link', 'Tell the whole story', 'Who’s in this story?', story.hidden_from_memories ? 'Show in memories again' : 'Hide from memories', story.private ? 'Move out of Private' : 'Move to Private', 'Rename', 'Delete story', 'Cancel'];
    const act = async (i: number) => {
      if (i === 0) await invite();
      if (i === 1) await copyInvite();
      if (i === 2) router.push({ pathname: '/story/tell', params: { id: story.id, title: story.title } });
      if (i === 3) setTagging(true);
      if (i === 4) { await updateStory(story.id, { hidden_from_memories: !story.hidden_from_memories }); void load(); }
      if (i === 5) { await updateStory(story.id, { private: !story.private }); Alert.alert(story.private ? 'Moved out of Private' : 'Moved to Private', story.private ? 'It now appears in Stories again.' : 'Only you can see it, behind your passcode.'); void load(); }
      if (i === 6) renameStory();
      if (i === 7) Alert.alert('Delete this story?', 'Its photos, recordings and words will be removed from Whole Story. Your originals stay on your phone.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await deleteStory(story.id); router.back(); } }]);
    };
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: items, destructiveButtonIndex: 7, cancelButtonIndex: 8 }, i => runAction(() => act(i)));
    else Alert.alert('Story options', '', [...items.slice(0, 8).map((t, i) => ({ text: t, style: i === 7 ? 'destructive' as const : undefined, onPress: () => act(i) })), { text: 'Cancel', style: 'cancel' as const }]);
  };
  const removeEntry = async (e: Entry) => {
    if (deletingEntryId) return;
    setDeletingEntryId(e.id);
    setEntryDeleteError(null);
    try {
      await deleteEntry(e);
      setConfirmingEntryId(null);
      await load();
    } catch (error: any) {
      setEntryDeleteError(error?.message ?? 'Could not delete this moment.');
    } finally {
      setDeletingEntryId(null);
    }
  };

  const openAdd = (mode?: 'voice' | 'write') => {
    router.push({ pathname: '/story/add/[id]', params: { id: story.id, title: story.title, shared: owner ? '0' : '1', owner: ownerName, ...(mode ? { mode } : {}) } });
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.cream }}>
        <View style={styles.topBar}>
          <Pressable onPress={backToStories} style={styles.circleBtn} accessibilityRole="button" accessibilityLabel="Back to Stories">
            <Icon name="back" size={22} color={C.navy} />
          </Pressable>
          <View style={styles.topCenter}>
            <Text style={styles.topTitle}>Stories</Text>
            <Thread width={76} />
          </View>
          {owner ? (
            <Pressable onPress={options} style={styles.circleBtn} accessibilityRole="button" accessibilityLabel="Story options">
              <Icon name="more" size={20} color={C.navy} />
            </Pressable>
          ) : <View style={{ width: 38 }} />}
        </View>
      </SafeAreaView>

      <Screen style={{ paddingTop: 0 }}>
        <View style={styles.heroWrap}>
          {heroCover ? (
            <Photo path={heroCover} size={width} style={{ width: '100%', height: 224, borderRadius: 0 }} />
          ) : (
            <View style={styles.heroFallback} />
          )}
          <Scrim start={0.22} />

          {owner && allPhotos.length > 0 ? (
            <Pressable onPress={() => setPickingCover(true)} style={styles.editCoverBtn} accessibilityRole="button">
              <Icon name="image" size={14} color="#FFF" />
              <Text style={styles.editCoverText}>Edit cover</Text>
            </Pressable>
          ) : null}

          <View style={styles.heroOverlay}>
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitle} numberOfLines={2}>{story.title}</Text>
              {owner ? (
                <Pressable onPress={renameStory} hitSlop={10} accessibilityLabel="Rename story">
                  <Icon name="pencil" size={16} color="#FFFFFFD8" />
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.heroMeta}>
              {story.private ? 'Private · ' : ''}
              {entries.length} {entries.length === 1 ? 'story' : 'stories'} · {allPhotos.length} {allPhotos.length === 1 ? 'photo' : 'photos'} · {storyDateText}
            </Text>
            {(locationPillLabel || storyCategory || storyTags.length > 0) ? (
              <View style={styles.heroPills}>
                {locationPillLabel ? (
                  <View style={styles.heroPill}>
                    <Icon name="pin" size={12} color="#FFF" />
                    <Text style={styles.heroPillText}>{locationPillLabel}</Text>
                  </View>
                ) : null}
                {storyCategory ? (
                  <View style={styles.heroPill}>
                    <Icon name={CATEGORY_TAGS[storyCategory].icon} size={12} color="#FFF" />
                    <Text style={styles.heroPillText}>{storyCategory}</Text>
                  </View>
                ) : null}
                {storyTags.slice(0, 2).map(t => (
                  <View key={t} style={styles.heroPill}><Text style={styles.heroPillText}>{t}</Text></View>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable onPress={() => openAdd()} style={styles.actionPrimary} accessibilityRole="button">
            <Icon name="image" size={15} color="#FFF" />
            <Text style={styles.actionPrimaryText} numberOfLines={1}>Add to story</Text>
          </Pressable>
          <Pressable onPress={() => openAdd('voice')} style={styles.actionSecondary} accessibilityRole="button">
            <Icon name="mic" size={15} color={C.navy} />
            <Text style={styles.actionSecondaryText} numberOfLines={1}>Record a story</Text>
          </Pressable>
          <Pressable onPress={() => openAdd('write')} style={styles.actionSecondary} accessibilityRole="button">
            <Icon name="pencil" size={15} color={C.navy} />
            <Text style={styles.actionSecondaryText} numberOfLines={1}>Write a story</Text>
          </Pressable>
        </View>

        <View style={styles.tabBar}>
          {([
            { key: 'moments', label: 'Moments' },
            { key: 'photos', label: `Photos (${allPhotos.length})` },
            { key: 'map', label: 'Map' },
            { key: 'people', label: 'People' },
          ] as const).map(item => (
            <Pressable key={item.key} onPress={() => setTab(item.key)} style={[styles.tabItem, tab === item.key && styles.tabItemOn]}>
              <Text style={[styles.tabText, tab === item.key && styles.tabTextOn]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'moments' ? (
          <>
            <View style={styles.momentsHeader}>
              <Text style={styles.momentsHeading}>Your moments</Text>
              <View style={styles.momentsBadge}>
                <Icon name="star" size={12} color={C.green} />
                <Text style={styles.momentsBadgeText}>{moments.length} {moments.length === 1 ? 'moment' : 'moments'}</Text>
              </View>
            </View>
            <Small style={{ marginBottom: 12 }}>
              Grouped by place and date. Tap a moment to add photos, stories and more.
            </Small>

            {!moments.length ? (
              <Empty title="Nothing here yet" body="Add photos, record your voice or write a memory to start this story." action="Add to story" onAction={() => openAdd()} />
            ) : (
              <>
                {featuredMoment ? (
                  <Pressable onPress={() => setActiveMomentId(featuredMoment.id)} style={styles.featuredCard} accessibilityRole="button">
                    {featuredMoment.coverPath ? (
                      <Photo path={featuredMoment.coverPath} size={136} style={styles.featuredImg} />
                    ) : (
                      <View style={styles.featuredPlaceholder}>
                        <Icon name="mic" size={24} color={C.green} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.momentTitle} numberOfLines={2}>{featuredMoment.title}</Text>
                      <View style={styles.momentMetaRow}>
                        <Icon name="calendar" size={12} color={C.grey} />
                        <Small>{featuredMoment.dateLabel} · {featuredMoment.photos.length} {featuredMoment.photos.length === 1 ? 'photo' : 'photos'}</Small>
                      </View>
                      {featuredMoment.storyCount > 0 ? (
                        <View style={styles.momentStoryPill}>
                          <Icon name="mic" size={12} color={C.green} />
                          <Text style={styles.momentStoryPillText}>{featuredMoment.storyCount} {featuredMoment.storyCount === 1 ? 'story' : 'stories'}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Icon name="forward" size={16} color={C.grey} />
                  </Pressable>
                ) : null}

                {gridMoments.length > 0 ? (
                  <View style={styles.momentGrid}>
                    {gridMoments.map(m => (
                      <Pressable key={m.id} onPress={() => setActiveMomentId(m.id)} style={[styles.gridCard, { width: momentCardWidth }]} accessibilityRole="button">
                        {m.coverPath ? (
                          <Photo path={m.coverPath} size={momentCardWidth} style={styles.gridImg} />
                        ) : (
                          <View style={styles.gridPlaceholder}>
                            <Icon name="document" size={22} color={C.green} />
                          </View>
                        )}
                        <View style={styles.gridBody}>
                          <Text style={styles.gridTitle} numberOfLines={2}>{m.title}</Text>
                          <View style={styles.gridFooter}>
                            <Icon name="calendar" size={11} color={C.grey} />
                            <Text style={styles.gridMeta} numberOfLines={1}>{m.dateLabel} · {m.photos.length}</Text>
                            <Icon name="forward" size={14} color={C.grey} />
                          </View>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </>
            )}

            <Pressable onPress={() => openAdd('voice')} style={styles.promptBanner} accessibilityRole="button">
              <View style={styles.promptMic}><Icon name="mic" size={20} color={C.green} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.promptTitle}>What do you remember about this trip?</Text>
                <Small>Add a voice or written story to bring it to life.</Small>
              </View>
              <Icon name="forward" size={16} color={C.grey} />
            </Pressable>
          </>
        ) : null}

        {tab === 'photos' ? (
          allPhotos.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {allPhotos.map(p => (
                <Pressable key={p.id} onPress={() => openPhoto(p, story.id, story.title)}>
                  <Photo path={p.path} size={photoTile} />
                </Pressable>
              ))}
            </View>
          ) : <Empty title="No photos yet" body="Add photos to see them in this gallery." />
        ) : null}

        {tab === 'map' ? (
          <Card>
            <Text style={styles.sectionTitle}>Story location</Text>
            <Small style={{ marginBottom: 10 }}>
              {placeBreakdown.length
                ? `Detected places: ${placeBreakdown.map(([place, count]) => `${place} (${count})`).join(' · ')}`
                : storyPlace
                  ? `Pinned at ${storyPlace.lat.toFixed(4)}, ${storyPlace.lng.toFixed(4)}`
                  : geoPhotos.length
                    ? `${geoPhotos.length} photos include GPS metadata.`
                    : 'No location added yet.'}
            </Small>
            {owner && !story.private ? <StoryLocationPicker value={storyPlace} onChange={place => runAction(() => updatePlace(place))} /> : null}
            <Btn title="Open on Stories Map" kind="outline" onPress={() => router.navigate('/map')} style={{ marginTop: 8 }} />
          </Card>
        ) : null}

        {tab === 'people' ? (
          <Card>
            <Text style={styles.sectionTitle}>People in this story</Text>
            {taggedPeople.length ? taggedPeople.map(p => (
              <Pressable key={p.id} onPress={() => router.push(`/people/${p.id}`)} style={styles.personListRow}>
                <View style={styles.avatarBubble}><Text style={styles.avatarText}>{p.name[0]?.toUpperCase()}</Text></View>
                <Text style={[styles.authorName, { flex: 1 }]}>{p.name}</Text>
                <Icon name="forward" size={16} color={C.grey} />
              </Pressable>
            )) : <Small style={{ marginBottom: 10 }}>No people tagged in this story yet.</Small>}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {owner ? <Btn title="Tag people" kind="outline" onPress={() => setTagging(true)} style={{ flex: 1 }} /> : null}
              {owner && !story.private ? <Btn title="Invite" kind="outline" onPress={invite} style={{ flex: 1 }} /> : null}
            </View>
            {owner && !story.private ? (
              <Btn title="Copy invite link" kind="link" onPress={() => runAction(copyInvite)} />
            ) : null}
          </Card>
        ) : null}
      </Screen>

      <Modal visible={!!activeMoment} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setActiveMomentId(null)}>
        {activeMoment ? (
          <ScrollView style={{ backgroundColor: C.cream }} contentContainerStyle={{ padding: S.pad }}>
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setActiveMomentId(null)} hitSlop={10}><Text style={{ color: C.green, fontFamily: F.sansMedium }}>Close</Text></Pressable>
              <Text style={styles.modalTitle} numberOfLines={1}>{activeMoment.title}</Text>
              <Pressable onPress={() => { setActiveMomentId(null); openAdd(); }} hitSlop={10}><Text style={{ color: C.green, fontFamily: F.sansBold }}>+ Add</Text></Pressable>
            </View>
            <Small style={{ marginBottom: 12 }}>{activeMoment.dateLabel} · {activeMoment.photos.length} {activeMoment.photos.length === 1 ? 'photo' : 'photos'}</Small>
            {activeMoment.photos.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {activeMoment.photos.map(p => (
                  <Pressable key={p.id} onPress={() => { setActiveMomentId(null); openPhoto(p, story.id, story.title); }}>
                    <Photo path={p.path} size={photoTile} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            {activeMoment.entries.map(e => (
              <Card key={e.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={styles.avatarBubble}><Text style={styles.avatarText}>{(e.author === uid ? 'Y' : (e.author_name || 'S')[0]).toUpperCase()}</Text></View>
                    <View>
                      <Text style={styles.authorName}>{e.author === uid ? 'You' : e.author_name || 'Someone'}</Text>
                      <Small>{new Date(e.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Small>
                    </View>
                  </View>
                  {e.author === uid || owner ? (
                    <Pressable disabled={!!deletingEntryId} onPress={() => { setConfirmingEntryId(e.id); setEntryDeleteError(null); }} hitSlop={10} accessibilityLabel="Delete moment">
                      <Icon name="trash" size={18} color={C.faint} />
                    </Pressable>
                  ) : null}
                </View>
                {confirmingEntryId === e.id && (e.author === uid || owner) ? (
                  <View style={{ backgroundColor: C.redSoft, borderRadius: 12, padding: 12, marginBottom: 10 }}>
                    <P>Delete this entry? This removes its photos, recording and words from the story.</P>
                    {entryDeleteError ? <Text accessibilityRole="alert" style={{ color: C.red, marginTop: 8 }}>{entryDeleteError}</Text> : null}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Btn title="Cancel" kind="outline" disabled={!!deletingEntryId} onPress={() => { setConfirmingEntryId(null); setEntryDeleteError(null); }} style={{ flex: 1 }} />
                      <Btn title="Delete" kind="danger" busy={deletingEntryId === e.id} disabled={!!deletingEntryId} onPress={() => { void removeEntry(e); setActiveMomentId(null); }} style={{ flex: 1 }} />
                    </View>
                  </View>
                ) : null}
                {e.text ? <Text style={{ fontFamily: F.serifRegular, fontSize: 16, color: C.ink, marginBottom: 6, lineHeight: 23 }}>{e.text}</Text> : null}
                {e.audio_path ? <VoicePlayer path={e.audio_path} durationMs={e.duration_ms} transcript={e.transcript} /> : null}
                {e.audio_path && uid && !story.private ? (
                  <Pressable onPress={() => runAction(async () => setVoiceFavourites(await toggleVoiceFavourite(uid, e.id, !voiceFavourites.includes(e.id))))} style={{ paddingVertical: 6 }}>
                    <Text style={{ color: C.green, fontFamily: F.sansMedium, fontSize: 13 }}>{voiceFavourites.includes(e.id) ? '♥ In Favourites' : '♡ Add voice note to Favourites'}</Text>
                  </Pressable>
                ) : null}
                <Comments items={e.comments ?? []} target={{ entry_id: e.id }} uid={uid} canModerate={owner} onChange={load} />
              </Card>
            ))}
            <Btn title="Add photos or story to this story" onPress={() => { setActiveMomentId(null); openAdd(); }} />
          </ScrollView>
        ) : null}
      </Modal>

      <Modal visible={pickingCover} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPickingCover(false)}>
        <ScrollView style={{ backgroundColor: C.cream }} contentContainerStyle={{ padding: S.pad }}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setPickingCover(false)} hitSlop={10}><Text style={{ color: C.green, fontFamily: F.sansMedium }}>Cancel</Text></Pressable>
            <Text style={styles.modalTitle}>Choose cover photo</Text>
            <View style={{ width: 48 }} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {allPhotos.map(p => (
              <Pressable key={p.id} onPress={() => runAction(() => pickStoryCover(p.path))}>
                <Photo path={p.path} size={photoTile} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </Modal>

      <Modal visible={tagging} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setTagging(false)}>
        <ScrollView style={{ backgroundColor: C.cream }} contentContainerStyle={{ padding: S.pad }} keyboardShouldPersistTaps="handled">
          <H1>Who’s in this story?</H1>
          <P muted style={{ marginBottom: 10 }}>Tap to add or remove. Each person’s page shows your stories together.</P>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{people.map(p => <Chip key={p.id} label={p.name} on={tagged.includes(p.id)} onPress={() => setTagged(tagged.includes(p.id) ? tagged.filter(x => x !== p.id) : [...tagged, p.id])} />)}</View>
          <Field label="Someone new" value={newName} onChangeText={setNewName} placeholder="Their name" />
          <Btn title="Add person" kind="outline" onPress={async () => { if (!newName.trim()) return; const pid = await addPerson(newName); setNewName(''); setPeople(await listPeople()); setTagged([...tagged, pid]); }} />
          <Btn title="Done" onPress={async () => { await setPeopleInStory(story.id, tagged); setTagging(false); void load(); }} />
        </ScrollView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.pad, paddingVertical: 8 },
  circleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  topCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topTitle: { fontFamily: F.serif, fontSize: 22, color: C.navy },
  heroWrap: { marginHorizontal: -S.pad, height: 224, backgroundColor: '#1B4332', overflow: 'hidden', position: 'relative' },
  heroFallback: { flex: 1, backgroundColor: '#1B4332' },
  editCoverBtn: { position: 'absolute', top: 12, right: 14, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(18, 28, 22, 0.56)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  editCoverText: { fontFamily: F.sansMedium, fontSize: 12, color: '#FFF' },
  heroOverlay: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroTitle: { fontFamily: F.serif, fontSize: 28, color: '#FFF', flexShrink: 1 },
  heroMeta: { fontFamily: F.sans, fontSize: 13, color: 'rgba(255,255,255,0.88)', marginTop: 2 },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  heroPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(18, 28, 22, 0.56)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  heroPillText: { fontFamily: F.sansMedium, fontSize: 12, color: '#FFF' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
  actionPrimary: { flex: 1.05, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.green, borderRadius: 22, paddingVertical: 12, paddingHorizontal: 10 },
  actionPrimaryText: { fontFamily: F.sansBold, fontSize: 12.5, color: '#FFF' },
  actionSecondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 22, paddingVertical: 12, paddingHorizontal: 8 },
  actionSecondaryText: { fontFamily: F.sansMedium, fontSize: 12, color: C.navy },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderColor: C.line, marginTop: 18, marginBottom: 18 },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderColor: 'transparent' },
  tabItemOn: { borderColor: C.green },
  tabText: { fontFamily: F.sansMedium, fontSize: 13.5, color: C.grey },
  tabTextOn: { color: C.green, fontFamily: F.sansBold },
  momentsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  momentsHeading: { fontFamily: F.serif, fontSize: 23, color: C.navy },
  momentsBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.greenSoft, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  momentsBadgeText: { fontFamily: F.sansMedium, fontSize: 12, color: C.green },
  featuredCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 14 },
  featuredImg: { width: 132, height: 92, borderRadius: 12 },
  featuredPlaceholder: { width: 132, height: 92, borderRadius: 12, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' },
  momentTitle: { fontFamily: F.serif, fontSize: 17, color: C.navy, marginBottom: 4 },
  momentMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  momentStoryPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.greenSoft, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  momentStoryPillText: { fontFamily: F.sansMedium, fontSize: 11.5, color: C.green },
  momentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  gridCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  gridImg: { width: '100%', height: 104, borderRadius: 0 },
  gridPlaceholder: { width: '100%', height: 104, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' },
  gridBody: { padding: 12 },
  gridTitle: { fontFamily: F.serif, fontSize: 15, color: C.navy, marginBottom: 4 },
  gridFooter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gridMeta: { flex: 1, fontFamily: F.sans, fontSize: 11, color: C.grey },
  promptBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#EAEFE7', borderRadius: 16, padding: 14, marginTop: 12 },
  promptMic: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' },
  promptTitle: { fontFamily: F.serif, fontSize: 16, color: C.navy, marginBottom: 2 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { flex: 1, textAlign: 'center', fontFamily: F.serif, fontSize: 18, color: C.navy, marginHorizontal: 8 },
  sectionTitle: { fontFamily: F.serif, fontSize: 19, color: C.navy, marginBottom: 4 },
  personListRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: C.line },
  avatarBubble: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: F.serif, fontSize: 14, color: C.green },
  authorName: { fontFamily: F.sansBold, fontSize: 14, color: C.navy },
});
