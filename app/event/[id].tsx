import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';
import { Alert } from '@/lib/alert';
import { Btn, Card, Chip, Empty, H1, H2, LoadError, Loading, P, Small, ToggleRow, runAction } from '@/components/ui';
import { Composer, Photo, VoicePlayer, fromAsset } from '@/components/media';
import { Comments } from '@/components/comments';
import { Icon } from '@/components/icon';
import {
  approvePost, deleteEvent, deletePost, emptyDraft, getEvent, hostPost, me, newEventLink, setCover, updateEvent,
  type Draft, type EventRow, type Moment, type Post,
} from '@/lib/api';
import { GUEST_PAGE_URL } from '@/lib/supabase';
import { eventUrl } from '@/lib/media';
import { exportEvent } from '@/lib/exporter';
import { C, F, S } from '@/lib/theme';
import { dateRange } from '@/lib/dates';

type EventTab = 'event' | 'add_photos' | 'timeline' | 'tell';
type TellMode = 'menu' | 'voice' | 'write' | 'photo_story';
const DOT_COLORS = ['#F5A623', '#1D6FF2', '#2F9E6B', '#E8402B'];

const EXPIRY: { key: string; label: string; at: (ev: EventRow) => string | null }[] = [
  { key: 'never', label: 'Never', at: () => null },
  { key: 'week', label: 'A week after the event', at: ev => { const d = new Date(ev.ends_on ?? ev.starts_on ?? Date.now()); d.setDate(d.getDate() + 8); return d.toISOString(); } },
  { key: '30', label: 'In 30 days', at: () => new Date(Date.now() + 30 * 864e5).toISOString() },
];

export default function EventScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [loadError, setLoadError] = useState('');
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<{ ev: EventRow; moments: Moment[]; posts: Post[] } | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [mode, setMode] = useState<EventTab>('event');
  const [wallView, setWallView] = useState<'photos' | 'stories'>('photos');
  const [timelineComments, setTimelineComments] = useState(false);
  const [tellMode, setTellMode] = useState<TellMode>('menu');
  const [photoStoryTab, setPhotoStoryTab] = useState<'record' | 'write'>('record');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [momentFilter, setMomentFilter] = useState<string>('all');
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [postMoment, setPostMoment] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoadError('');
      setData(await getEvent(id));
      setUid((await me())?.id ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load. Please try again.');
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void load();
    const timer = setInterval(() => {
      getEvent(id).then(result => { if (active) setData(result); }).catch(() => {});
    }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [load, id]));

  const livePosts = useMemo(() => (data?.posts ?? []).filter(p => p.approved), [data]);
  const allPhotos = useMemo(() => livePosts.flatMap(p => p.photos.map(ph => ({ ...ph, post: p }))), [livePosts]);
  const storyPosts = useMemo(() => livePosts.filter(p => !!p.text || !!p.audio_path), [livePosts]);
  const totalComments = useMemo(() => livePosts.reduce((n, p) => n + p.comments.length, 0), [livePosts]);

  if (loadError) return <LoadError error={loadError} onRetry={load} />;
  if (!data) return <Loading />;

  const { ev, posts, moments } = data;
  const link = `${GUEST_PAGE_URL}?e=${ev.code}`;
  const expired = !!ev.link_expires_at && new Date(ev.link_expires_at) <= new Date();
  const pending = posts.filter(p => !p.approved);
  const momentName = (mid: string | null) => moments.find(m => m.id === mid)?.name;
  const tileSize = Math.floor((width - S.pad * 2 - 12) / 3);

  const set = async (patch: Partial<EventRow>) => { await updateEvent(ev.id, patch); void load(); };
  const changeCover = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [16, 9] });
    if (!r.canceled) { await setCover(ev.id, r.assets[0].uri); void load(); }
  };
  const remove = (p: Post) => Alert.alert('Remove this from the wall?', '', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => { await deletePost(p); void load(); } },
  ]);

  const pickPhotos = async (multiple = true) => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: multiple, selectionLimit: multiple ? 30 : 1, quality: 0.85, exif: true,
    });
    if (!r.canceled && r.assets.length) {
      setDraft(cur => ({ ...cur, photos: multiple ? [...cur.photos, ...r.assets.map(fromAsset)] : [fromAsset(r.assets[0])] }));
    }
  };

  const submitPost = async () => {
    if (busy) return;
    if (draft.recording || draft.processingAudio) return Alert.alert('Finish your recording first', 'Stop recording and wait for the words before saving.');
    if (!draft.photos.length && !draft.text.trim() && !draft.audioUri) return Alert.alert('Add something first', 'Choose a photo, record your voice or write a few words.');
    setBusy(true);
    try {
      await hostPost(ev.id, draft, postMoment);
      setDraft(emptyDraft());
      setTellMode('menu');
      setMode('event');
      void load();
    } catch (e: any) {
      Alert.alert('Could not add', e.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const renderPostCard = (p: Post) => (
    <Card key={p.id}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <View style={styles.authorDot}><Text style={styles.authorInitial}>{(p.author_user ? 'Y' : (p.guest_name || 'G')[0]).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.authorName}>{p.author_user ? 'You (host)' : p.guest_name || 'Guest'}</Text>
            <Small>{[momentName(p.moment_id), p.audio_path ? 'Voice story' : p.text ? 'Written story' : 'Photos', new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}</Small>
          </View>
        </View>
        <Pressable onPress={() => remove(p)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove"><Icon name="trash" size={18} color={C.faint} /></Pressable>
      </View>
      {p.photos.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {p.photos.map(ph => <Photo key={ph.id} path={ph.path} event size={96} style={p.photos.length === 1 ? { width: '100%', height: 240 } : undefined} />)}
        </View>
      ) : null}
      {p.text ? <Text style={{ fontFamily: F.serifRegular, fontSize: 16, color: C.ink, marginTop: 8, lineHeight: 22 }}>{p.text}</Text> : null}
      {p.audio_path ? <VoicePlayer path={p.audio_path} event durationMs={p.duration_ms} /> : null}
      {!p.approved ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Btn title="Approve" onPress={async () => { await approvePost(p.id); void load(); }} style={{ flex: 1 }} />
          <Btn title="Remove" kind="outline" onPress={() => remove(p)} style={{ flex: 1 }} />
        </View>
      ) : (
        <Comments items={p.comments} target={{ post_id: p.id }} uid={uid} canModerate onChange={load} />
      )}
    </Card>
  );

  const eventHeaderStrip = (
    <View style={styles.miniHeader}>
      {ev.cover_path ? <Image source={{ uri: eventUrl(ev.cover_path) }} style={styles.miniCover} contentFit="cover" /> : <View style={[styles.miniCover, { backgroundColor: C.greenSoft }]} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.miniTitle} numberOfLines={1}>{ev.name}</Text>
        <Small numberOfLines={1}>{[dateRange(ev.starts_on, ev.ends_on), ev.place].filter(Boolean).join(' · ')}</Small>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      <Stack.Screen options={{ title: '', headerRight: () => <Pressable onPress={() => setSettingsOpen(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Event settings"><Icon name="more" size={24} color={C.ink} /></Pressable> }} />

      <ScrollView contentContainerStyle={{ padding: S.pad, paddingBottom: 96 + insets.bottom }} keyboardShouldPersistTaps="handled">
        {mode === 'event' ? (
          <>
            <Pressable onPress={() => runAction(changeCover)} accessibilityLabel="Change cover photo" style={styles.coverWrap}>
              {ev.cover_path ? <Image source={{ uri: eventUrl(ev.cover_path) }} style={{ width: '100%', height: 210 }} contentFit="cover" />
                : <View style={{ height: 130, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: F.sansMedium, color: C.green }}>＋ Add a cover photo</Text></View>}
              <View style={styles.editCoverBadge}><Icon name="camera" size={14} color="#FFF" /><Text style={styles.editCoverText}>Edit cover</Text></View>
            </Pressable>

            <H1 style={{ marginBottom: 4 }}>{ev.name}</H1>
            <Small style={{ marginBottom: 10 }}>
              {[dateRange(ev.starts_on, ev.ends_on), ev.place].filter(Boolean).join(' · ')}{ev.is_open && !expired ? '' : ' · Wall closed'}
            </Small>

            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: '#FCEBE8' }]}><Text style={[styles.badgeText, { color: '#D2382B' }]}>{ev.kind}</Text></View>
              <View style={[styles.badge, { backgroundColor: C.greenSoft }]}><Text style={[styles.badgeText, { color: C.green }]}>{ev.is_open ? 'Open wall' : 'Wall closed'}</Text></View>
              <Pressable onPress={() => Share.share({ message: `Add your photos and stories from ${ev.name}: ${link}` })} style={styles.invitePill}>
                <Icon name="people" size={14} color={C.navy} />
                <Text style={styles.invitePillText}>Invite people</Text>
              </Pressable>
            </View>

            <View style={styles.shortcutRow}>
              {[
                { key: 'timeline', icon: 'calendar' as const, title: 'Timeline', sub: 'By moment', onPress: () => { setTimelineComments(false); setMode('timeline'); } },
                { key: 'map', icon: 'pin' as const, title: 'Map view', sub: 'All locations', onPress: () => router.navigate('/map') },
                { key: 'stories', icon: 'people' as const, title: 'Stories', sub: `${storyPosts.length} shared`, onPress: () => setWallView('stories') },
                { key: 'schedule', icon: 'book' as const, title: 'Calendar', sub: 'Schedule', onPress: () => router.push(`/event/schedule/${ev.id}`) },
              ].map(card => (
                <Pressable key={card.key} onPress={card.onPress} style={styles.shortcutCard}>
                  <View style={styles.shortcutIcon}><Icon name={card.icon} size={20} color={C.green} /></View>
                  <Text style={styles.shortcutTitle} numberOfLines={1}>{card.title}</Text>
                  <Text style={styles.shortcutSub} numberOfLines={1}>{card.sub}</Text>
                </Pressable>
              ))}
            </View>

            <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
              <QRCode value={link} size={90} color={C.navy} backgroundColor={C.card} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.serif, fontSize: 18, color: C.navy }}>Share this event</Text>
                <Small>Scan the QR code to view, add photos and stories. No app needed.</Small>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Pressable onPress={async () => { await Clipboard.setStringAsync(link); Alert.alert('Link copied', link); }} style={styles.qrBtnOutline}>
                    <Text style={styles.qrBtnOutlineText}>Copy link</Text>
                  </Pressable>
                  <Pressable onPress={() => Share.share({ message: `Add your photos and stories from ${ev.name}: ${link}` })} style={styles.qrBtnGreen}>
                    <Text style={styles.qrBtnGreenText}>Share QR</Text>
                  </Pressable>
                </View>
              </View>
            </Card>

            {pending.length ? <><H2 style={{ marginTop: 8 }}>Waiting for approval ({pending.length})</H2>{pending.map(renderPostCard)}</> : null}

            <View style={styles.switchTabs}>
              <Pressable onPress={() => setWallView('photos')} style={[styles.switchTab, wallView === 'photos' && styles.switchTabOn]}>
                <Text style={[styles.switchTabText, wallView === 'photos' && styles.switchTabTextOn]}>Photos · {allPhotos.length}</Text>
              </Pressable>
              <Pressable onPress={() => setWallView('stories')} style={[styles.switchTab, wallView === 'stories' && styles.switchTabOn]}>
                <Text style={[styles.switchTabText, wallView === 'stories' && styles.switchTabTextOn]}>Stories · {storyPosts.length}</Text>
              </Pressable>
            </View>

            {wallView === 'photos' ? (
              allPhotos.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {allPhotos.map(ph => <Photo key={ph.id} path={ph.path} event size={tileSize} />)}
                </View>
              ) : <Empty title="No photos yet" body="Tap Add Photos below or share the QR code so guests can add theirs." />
            ) : (
              storyPosts.length ? storyPosts.map(renderPostCard) : <Empty title="No guest stories yet" body="Tap Tell a Story below to record a voice story or write a message." />
            )}
          </>
        ) : null}

        {mode === 'add_photos' ? (
          <>
            <H1 style={{ textAlign: 'center' }}>Add photos</H1>
            <P muted style={{ textAlign: 'center', marginBottom: 14 }}>Select photos to add to {ev.name}</P>
            <Btn title={draft.photos.length ? `Choose more photos (${draft.photos.length} selected)` : 'Select photos'} kind="outline" onPress={() => void pickPhotos(true)} />
            {draft.photos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginVertical: 10 }}>
                {draft.photos.map((p, idx) => (
                  <View key={p.uri + idx} style={{ width: 78, height: 78, borderRadius: 12, overflow: 'hidden' }}>
                    <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    <Pressable onPress={() => setDraft(c => ({ ...c, photos: c.photos.filter((_, j) => j !== idx) }))} style={styles.removeBadge}>
                      <Icon name="close" size={12} color={C.ink} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}

            <H2 style={{ marginTop: 12 }}>Add to timeline</H2>
            <Small style={{ marginBottom: 8 }}>Choose where these photos belong.</Small>
            {moments.map(m => {
              const active = postMoment === m.id;
              return (
                <Pressable key={m.id} onPress={() => setPostMoment(m.id)} style={[styles.radioCard, active && styles.radioCardOn]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.radioTitle}>{m.name}</Text>
                    {m.time_label ? <Small>{m.time_label}</Small> : null}
                  </View>
                  <View style={[styles.radioDot, active && styles.radioDotOn]} />
                </Pressable>
              );
            })}
            <Pressable onPress={() => setPostMoment(null)} style={[styles.radioCard, postMoment === null && styles.radioCardOn]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.radioTitle}>Not sure which moment?</Text>
                <Small>Add to the event and organise later.</Small>
              </View>
              <View style={[styles.radioDot, postMoment === null && styles.radioDotOn]} />
            </Pressable>

            <Btn title={`Add to ${postMoment ? (momentName(postMoment) ?? 'event') : 'event'} (${draft.photos.length})`}
              onPress={submitPost} busy={busy} disabled={!draft.photos.length || !ev.is_open} style={{ marginTop: 12 }} />
          </>
        ) : null}

        {mode === 'timeline' ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <H1 style={{ marginBottom: 0 }}>Live timeline</H1>
              <Pressable onPress={() => setTimelineComments(v => !v)} style={styles.commentToggle}>
                <Icon name="document" size={15} color={C.green} />
                <Text style={styles.commentToggleText}>{timelineComments ? 'Show timeline' : `Comments (${totalComments})`}</Text>
              </Pressable>
            </View>
            <P muted style={{ marginBottom: 12 }}>See your event unfold, one moment at a time.</P>

            {timelineComments ? (
              livePosts.length ? livePosts.map(renderPostCard) : <Empty title="No comments yet" body="Guest photos, memories and comments will appear here." />
            ) : (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  <Chip label="All" on={momentFilter === 'all'} onPress={() => setMomentFilter('all')} />
                  {moments.map(m => <Chip key={m.id} label={m.name} on={momentFilter === m.id} onPress={() => setMomentFilter(m.id)} />)}
                </ScrollView>

                {(momentFilter === 'all' ? moments : moments.filter(m => m.id === momentFilter)).map((m, idx) => {
                  const mPosts = livePosts.filter(p => p.moment_id === m.id);
                  const mPhotos = mPosts.flatMap(p => p.photos);
                  const mTexts = mPosts.filter(p => p.text || p.audio_path);
                  return (
                    <View key={m.id} style={styles.timelineBlock}>
                      <View style={styles.timelineRow}>
                        <View style={[styles.timelineDot, { backgroundColor: DOT_COLORS[idx % DOT_COLORS.length] }]} />
                        <View>
                          {m.time_label ? <Small>{m.time_label}</Small> : null}
                          <Text style={styles.timelineTitle}>{m.name}</Text>
                        </View>
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
                        {mPhotos.map(ph => <Photo key={ph.id} path={ph.path} event size={84} />)}
                        <Pressable onPress={() => { setPostMoment(m.id); setMode('add_photos'); }} style={styles.addTile}>
                          <Icon name="plus" size={20} color={C.green} />
                          <Text style={styles.addTileText}>Add photos</Text>
                        </Pressable>
                      </ScrollView>
                      {mTexts.map(p => (
                        <View key={p.id} style={styles.timelineNote}>
                          {p.audio_path ? <VoicePlayer path={p.audio_path} event durationMs={p.duration_ms} /> : null}
                          {p.text ? <Text style={styles.timelineNoteText}>{p.text}</Text> : null}
                        </View>
                      ))}
                    </View>
                  );
                })}
                <Btn title="Add photos to whole event" onPress={() => { setPostMoment(null); setMode('add_photos'); }} style={{ marginTop: 10 }} />
              </>
            )}
          </>
        ) : null}

        {mode === 'tell' ? (
          <>
            {eventHeaderStrip}
            {tellMode === 'menu' ? (
              <>
                <H1 style={{ marginTop: 14 }}>Tell a story</H1>
                <P muted style={{ marginBottom: 14 }}>Share what happened, how it felt or what this moment meant to you.</P>
                {[
                  { key: 'voice' as const, icon: 'mic' as const, bg: '#FCEBE8', tint: '#C0533E', title: 'Record a voice story', sub: 'Capture the moment in your own words.' },
                  { key: 'write' as const, icon: 'document' as const, bg: C.greenSoft, tint: C.green, title: 'Write a story', sub: 'Share a memory, a message or a special moment.' },
                  { key: 'photo_story' as const, icon: 'image' as const, bg: '#FCF1E2', tint: '#B36B12', title: 'Add a photo with a story', sub: 'Choose a photo and add your voice or text.' },
                ].map(item => (
                  <Pressable key={item.key} onPress={() => { setDraft(emptyDraft()); setTellMode(item.key); }} style={styles.tellCard}>
                    <View style={[styles.tellIcon, { backgroundColor: item.bg }]}><Icon name={item.icon} size={22} color={item.tint} /></View>
                    <View style={{ flex: 1 }}><Text style={styles.tellTitle}>{item.title}</Text><Small>{item.sub}</Small></View>
                    <Icon name="forward" size={18} color={C.grey} />
                  </Pressable>
                ))}
              </>
            ) : null}

            {tellMode === 'voice' ? (
              <>
                <H1 style={{ marginTop: 14 }}>Record your story</H1>
                <P muted style={{ marginBottom: 10 }}>Share what you remember. You can add a photo too.</P>
                <Composer draft={draft} setDraft={setDraft} hidePhotos hideText />
                <Btn title={draft.photos.length ? `Choose different photos (${draft.photos.length})` : 'Attach a photo (optional)'} kind="outline" onPress={() => void pickPhotos(true)} />
                {moments.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                    <Chip label="No specific moment" on={postMoment === null} onPress={() => setPostMoment(null)} />
                    {moments.map(m => <Chip key={m.id} label={m.name} on={postMoment === m.id} onPress={() => setPostMoment(m.id)} />)}
                  </ScrollView>
                ) : null}
                <Btn title="Save story" onPress={submitPost} busy={busy} disabled={!!(draft.recording || draft.processingAudio)} style={{ marginTop: 10 }} />
                <Btn title="Back" kind="link" onPress={() => setTellMode('menu')} />
              </>
            ) : null}

            {tellMode === 'write' ? (
              <>
                <H1 style={{ marginTop: 14 }}>Write your story</H1>
                <P muted style={{ marginBottom: 10 }}>Share a memory, a message or what this moment meant to you.</P>
                <View style={styles.writeBox}>
                  <TextInput value={draft.text} onChangeText={t => setDraft(c => ({ ...c, text: t.slice(0, 500) }))}
                    multiline placeholder="Write your story here…" placeholderTextColor={C.faint} style={styles.writeInput} />
                  <Text style={styles.counter}>{draft.text.length}/500</Text>
                </View>
                <Btn title={draft.photos.length ? `Photo attached (${draft.photos.length})` : '+ Add a photo (optional)'} kind="outline" onPress={() => void pickPhotos(true)} style={{ marginTop: 8 }} />
                <Btn title="Save story" onPress={submitPost} busy={busy} style={{ marginTop: 8 }} />
                <Btn title="Back" kind="link" onPress={() => setTellMode('menu')} />
              </>
            ) : null}

            {tellMode === 'photo_story' ? (
              <>
                <H1 style={{ marginTop: 14 }}>Add a story to this photo</H1>
                {draft.photos[0] ? (
                  <View style={{ marginVertical: 10 }}>
                    <Image source={{ uri: draft.photos[0].uri }} style={{ width: '100%', height: 200, borderRadius: 16 }} contentFit="cover" />
                    <Btn title="Choose a different photo" kind="link" onPress={() => void pickPhotos(false)} />
                  </View>
                ) : (
                  <Btn title="Choose a photo" kind="outline" onPress={() => void pickPhotos(false)} style={{ marginVertical: 10 }} />
                )}
                <View style={styles.switchTabs}>
                  <Pressable onPress={() => setPhotoStoryTab('record')} style={[styles.switchTab, photoStoryTab === 'record' && styles.switchTabOn]}>
                    <Text style={[styles.switchTabText, photoStoryTab === 'record' && styles.switchTabTextOn]}>Record</Text>
                  </Pressable>
                  <Pressable onPress={() => setPhotoStoryTab('write')} style={[styles.switchTab, photoStoryTab === 'write' && styles.switchTabOn]}>
                    <Text style={[styles.switchTabText, photoStoryTab === 'write' && styles.switchTabTextOn]}>Write</Text>
                  </Pressable>
                </View>
                {photoStoryTab === 'record'
                  ? <Composer draft={draft} setDraft={setDraft} hidePhotos hideText />
                  : <View style={styles.writeBox}><TextInput value={draft.text} onChangeText={t => setDraft(c => ({ ...c, text: t.slice(0, 500) }))} multiline placeholder="Write what happened in this photo…" placeholderTextColor={C.faint} style={styles.writeInput} /></View>}
                <Btn title="Save and add to event" onPress={submitPost} busy={busy} disabled={!!(draft.recording || draft.processingAudio)} style={{ marginTop: 10 }} />
                <Btn title="Back" kind="link" onPress={() => setTellMode('menu')} />
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(8, insets.bottom) }]}>
        {([
          { key: 'event' as const, icon: 'home' as const, label: 'Event' },
          { key: 'add_photos' as const, icon: 'image' as const, label: 'Add Photos' },
          { key: 'timeline' as const, icon: 'calendar' as const, label: 'Timeline' },
          { key: 'tell' as const, icon: 'mic' as const, label: 'Tell a Story' },
        ]).map(item => {
          const active = mode === item.key;
          const isTell = item.key === 'tell';
          return (
            <Pressable key={item.key} onPress={() => { setMode(item.key); if (item.key === 'tell') setTellMode('menu'); }} style={styles.bottomItem}>
              {isTell ? (
                <View style={styles.tellFab}><Icon name="mic" size={18} color="#FFF" /></View>
              ) : (
                <Icon name={item.icon} size={22} color={active ? C.green : C.navy} />
              )}
              <Text style={[styles.bottomLabel, active && { color: C.green, fontFamily: F.sansBold }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Modal visible={settingsOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSettingsOpen(false)}>
        <ScrollView style={{ backgroundColor: C.cream }} contentContainerStyle={{ padding: S.pad }}>
          <H1>Event settings</H1>
          <ToggleRow title="Wall open" sub="Turn off to stop new photos and stories from you and guests" value={ev.is_open} onChange={v => set({ is_open: v })} />
          <ToggleRow title="Allow guest uploads" sub="Let guests add photos and stories" value={ev.allow_guest_uploads} onChange={v => set({ allow_guest_uploads: v })} />
          <ToggleRow title="Require approval" sub="Guest photos and stories wait for you before they appear" value={ev.require_approval} onChange={v => set({ require_approval: v })} />
          <H2 style={{ marginTop: 10 }}>What guests can see</H2>
          <View style={{ flexDirection: 'row' }}>
            <Chip label="Everyone’s uploads" on={ev.guests_see === 'all'} onPress={() => set({ guests_see: 'all' })} />
            <Chip label="Only their own" on={ev.guests_see === 'own'} onPress={() => set({ guests_see: 'own' })} />
          </View>
          <Small style={{ marginBottom: 14 }}>You always see everything.</Small>
          <H2>QR code and link</H2>
          <Small style={{ marginBottom: 6 }}>Link expires</Small>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {EXPIRY.map(x => <Chip key={x.key} label={x.label} on={x.key === 'never' ? !ev.link_expires_at : false} onPress={() => set({ link_expires_at: x.at(ev) })} />)}
          </View>
          {ev.link_expires_at ? <Small style={{ marginBottom: 8 }}>{expired ? 'Expired' : 'Works until'} {new Date(ev.link_expires_at).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</Small> : null}
          <Btn title="Make a new link" kind="outline" onPress={() => Alert.alert('Make a new link?', 'The old link and QR code will stop working. Guests who already added keep what they added.', [
            { text: 'Cancel', style: 'cancel' }, { text: 'New link', onPress: async () => { await newEventLink(ev.id); void load(); } }])} />
          <H2 style={{ marginTop: 10 }}>Keep everything</H2>
          <Btn title="Download everything" kind="outline" onPress={async () => { try { await exportEvent(ev.id, ev.name); } catch (e: any) { Alert.alert('Could not download', e.message ?? ''); } }} />
          <Small style={{ marginBottom: 10 }}>All photos, voice recordings and stories in one file, ready to save or send.</Small>
          <Btn title="Done" onPress={() => setSettingsOpen(false)} />
          <Btn title="Delete event wall" kind="outline" onPress={() => Alert.alert('Delete this event wall?', 'Everything guests added will be removed. This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { setSettingsOpen(false); await deleteEvent(ev.id); router.back(); } }])} />
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  coverWrap: { marginHorizontal: -S.pad, marginTop: -S.pad, marginBottom: 12 },
  editCoverBadge: { position: 'absolute', right: 12, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(15,27,51,0.72)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  editCoverText: { fontFamily: F.sansMedium, fontSize: 12, color: '#FFF' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 },
  badge: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontFamily: F.sansMedium, fontSize: 12 },
  invitePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 12, paddingVertical: 6 },
  invitePillText: { fontFamily: F.sansMedium, fontSize: 12.5, color: C.navy },
  shortcutRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  shortcutCard: { flex: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 10, alignItems: 'center' },
  shortcutIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  shortcutTitle: { fontFamily: F.sansBold, fontSize: 11.5, color: C.navy },
  shortcutSub: { fontFamily: F.sans, fontSize: 10, color: C.grey, marginTop: 1 },
  qrBtnOutline: { borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.cream, paddingHorizontal: 12, paddingVertical: 7 },
  qrBtnOutlineText: { fontFamily: F.sansMedium, fontSize: 12.5, color: C.navy },
  qrBtnGreen: { borderRadius: 16, backgroundColor: C.green, paddingHorizontal: 12, paddingVertical: 7 },
  qrBtnGreenText: { fontFamily: F.sansMedium, fontSize: 12.5, color: '#FFF' },
  switchTabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: C.line, marginTop: 10, marginBottom: 12 },
  switchTab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderColor: 'transparent' },
  switchTabOn: { borderColor: C.green },
  switchTabText: { fontFamily: F.sansMedium, fontSize: 13.5, color: C.grey },
  switchTabTextOn: { color: C.navy, fontFamily: F.sansBold },
  authorDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' },
  authorInitial: { fontFamily: F.serif, fontSize: 15, color: C.green },
  authorName: { fontFamily: F.sansBold, fontSize: 14, color: C.navy },
  removeBadge: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFFEB', alignItems: 'center', justifyContent: 'center' },
  radioCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 13, marginBottom: 8 },
  radioCardOn: { borderColor: C.green, backgroundColor: C.greenSoft },
  radioTitle: { fontFamily: F.serif, fontSize: 17, color: C.navy },
  radioDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.grey },
  radioDotOn: { borderColor: C.green, backgroundColor: C.green },
  commentToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.greenSoft, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  commentToggleText: { fontFamily: F.sansMedium, fontSize: 12.5, color: C.green },
  timelineBlock: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 12 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timelineDot: { width: 10, height: 10, borderRadius: 5 },
  timelineTitle: { fontFamily: F.serif, fontSize: 18, color: C.navy },
  addTile: { width: 84, height: 84, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.green, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' },
  addTileText: { fontFamily: F.sansMedium, fontSize: 11, color: C.green, marginTop: 3 },
  timelineNote: { backgroundColor: C.cream, borderRadius: 12, padding: 10, marginTop: 8 },
  timelineNoteText: { fontFamily: F.serifRegular, fontSize: 15, color: C.ink, marginTop: 4 },
  miniHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 10 },
  miniCover: { width: 48, height: 48, borderRadius: 10 },
  miniTitle: { fontFamily: F.serif, fontSize: 17, color: C.navy },
  tellCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: 10 },
  tellIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tellTitle: { fontFamily: F.serif, fontSize: 18, color: C.navy },
  writeBox: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12, minHeight: 130 },
  writeInput: { fontFamily: F.sans, fontSize: 15, color: C.ink, minHeight: 96, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', fontFamily: F.sans, fontSize: 11.5, color: C.grey },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderColor: C.line, paddingTop: 8 },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
  bottomLabel: { fontFamily: F.sansMedium, fontSize: 11, color: C.navy },
  tellFab: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#C0533E', alignItems: 'center', justifyContent: 'center' },
});
