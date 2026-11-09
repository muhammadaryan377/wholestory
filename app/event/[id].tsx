import { useCallback, useState } from 'react';
import { Share, View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { Alert } from '@/lib/alert';
import { router, useFocusEffect, useLocalSearchParams, Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';
import { LoadError, Screen, H1, H2, Small, Card, Btn, Loading, Empty, ToggleRow, Chip, P, runAction } from '@/components/ui';
import { Photo, VoicePlayer, Composer } from '@/components/media';
import { Comments } from '@/components/comments';
import { Icon } from '@/components/icon';
import { approvePost, deleteEvent, deletePost, emptyDraft, getEvent, hostPost, me, newEventLink, setCover, updateEvent, type Draft, type EventRow, type Moment, type Post } from '@/lib/api';
import { GUEST_PAGE_URL } from '@/lib/supabase';
import { eventUrl } from '@/lib/media';
import { exportEvent } from '@/lib/exporter';
import { C, F, S } from '@/lib/theme';
import { dateRange } from '@/lib/dates';

const EXPIRY: { key: string; label: string; at: (ev: EventRow) => string | null }[] = [
  { key: 'never', label: 'Never', at: () => null },
  { key: 'week', label: 'A week after the event', at: ev => { const d = new Date(ev.ends_on ?? ev.starts_on ?? Date.now()); d.setDate(d.getDate() + 8); return d.toISOString(); } },
  { key: '30', label: 'In 30 days', at: () => new Date(Date.now() + 30 * 864e5).toISOString() },
];

export default function EventScreen() {
  const [loadError, setLoadError] = useState('');
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<{ ev: EventRow; moments: Moment[]; posts: Post[] } | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'none' | 'settings' | 'add'>('none');
  const [tab, setTab] = useState<string>('all');
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [postMoment, setPostMoment] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setLoadError(''); setData(await getEvent(id)); setUid((await me())?.id ?? null); } catch (e) { setLoadError(e instanceof Error ? e.message : 'Could not load. Please try again.'); } }, [id]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void load();
    const timer = setInterval(() => {
      getEvent(id).then(result => { if (active) setData(result); }).catch(() => {});
    }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [load, id]));
  if (loadError) return <LoadError error={loadError} onRetry={load} />;
  if (!data) return <Loading />;
  const { ev, posts, moments } = data;
  const link = `${GUEST_PAGE_URL}?e=${ev.code}`;
  const expired = !!ev.link_expires_at && new Date(ev.link_expires_at) <= new Date();
  const pending = posts.filter(p => !p.approved);
  const live = posts.filter(p => p.approved);
  const shown = tab === 'all' ? live : live.filter(p => (tab === 'none' ? !p.moment_id : p.moment_id === tab));
  const photoCount = live.reduce((n, p) => n + p.photos.length, 0);
  const momentName = (mid: string | null) => moments.find(m => m.id === mid)?.name;

  const set = async (patch: Partial<EventRow>) => { await updateEvent(ev.id, patch); load(); };
  const changeCover = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [16, 9] });
    if (!r.canceled) { await setCover(ev.id, r.assets[0].uri); load(); }
  };
  const remove = (p: Post) => Alert.alert('Remove this from the wall?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => { await deletePost(p); load(); } }]);
  const addPost = async () => {
    if (busy) return;
    if (draft.recording || draft.processingAudio) return Alert.alert('Finish your recording first', 'Stop recording and wait for the words before saving.');
    if (!draft.photos.length && !draft.text.trim() && !draft.audioUri) return Alert.alert('Add something first');
    setBusy(true);
    try { await hostPost(ev.id, draft, postMoment); setDraft(emptyDraft()); setSheet('none'); load(); }
    catch (e: any) { Alert.alert('Could not add', e.message ?? 'Please try again.'); } finally { setBusy(false); }
  };
  const expiryKey = !ev.link_expires_at ? 'never' : 'set';

  const renderPost = (p: Post) => (
    <Card key={p.id}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Small>{p.author_user ? 'You (host)' : p.guest_name || 'Guest'}{momentName(p.moment_id) ? ` · ${momentName(p.moment_id)}` : ''} · {new Date(p.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Small>
        <Pressable onPress={() => remove(p)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove"><Icon name="trash" size={18} color={C.faint} /></Pressable>
      </View>
      {p.photos.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{p.photos.map(ph => <Photo key={ph.id} path={ph.path} event size={96} style={p.photos.length === 1 ? { width: '100%', height: 280 } : undefined} />)}</View> : null}
      {p.text ? <Text style={{ fontFamily: F.serifRegular, fontSize: 16, color: C.ink, marginTop: 8 }}>{p.text}</Text> : null}
      {p.audio_path ? <VoicePlayer path={p.audio_path} event durationMs={p.duration_ms} /> : null}
      {!p.approved ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}><Btn title="Approve" onPress={async () => { await approvePost(p.id); load(); }} style={{ flex: 1 }} /><Btn title="Remove" kind="outline" onPress={() => remove(p)} style={{ flex: 1 }} /></View>
        : <Comments items={p.comments} target={{ post_id: p.id }} uid={uid} canModerate onChange={load} />}
    </Card>
  );

  return (
    <>
      <Stack.Screen options={{ title: '', headerRight: () => <Pressable onPress={() => setSheet('settings')} hitSlop={12} accessibilityRole="button" accessibilityLabel="Event settings"><Icon name="more" size={24} color={C.ink} /></Pressable> }} />
      <Screen>
        <Pressable onPress={() => runAction(changeCover)} accessibilityLabel="Change cover photo" style={{ marginHorizontal: -S.pad, marginTop: -S.pad, marginBottom: 12 }}>
          {ev.cover_path ? <Image source={{ uri: eventUrl(ev.cover_path) }} style={{ width: '100%', height: 210 }} contentFit="cover" />
            : <View style={{ height: 120, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: F.sansMedium, color: C.green }}>＋ Add a cover photo</Text></View>}
          {ev.cover_path ? <View style={{ position: 'absolute', right: 12, bottom: 10, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 }}><Text style={{ color: '#fff', fontFamily: F.sansMedium, fontSize: 12 }}>Edit cover</Text></View> : null}
        </Pressable>
        <H1>{ev.name}</H1>
        <Small style={{ marginBottom: 10 }}>{[dateRange(ev.starts_on, ev.ends_on), ev.place].filter(Boolean).join(' · ')}{ev.is_open && !expired ? '' : ' · Wall closed'}</Small>
        <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <QRCode value={link} size={96} color={C.navy} backgroundColor={C.card} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.serif, fontSize: 17, color: C.navy }}>Share this event</Text>
            <Small>Guests scan the code or open the link to add photos and stories. No app needed.{ev.link_expires_at ? ` Link ${expired ? 'expired' : 'works until'} ${new Date(ev.link_expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.` : ''}</Small>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
              <Chip label="Copy link" onPress={async () => { await Clipboard.setStringAsync(link); Alert.alert('Link copied', link); }} />
              <Chip label="Share" onPress={() => Share.share({ message: `Add your photos and stories from ${ev.name}: ${link}` })} />
            </View>
          </View>
        </Card>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn title="Add photos or a story" onPress={() => { setPostMoment(tab !== 'all' && tab !== 'none' ? tab : null); setSheet('add'); }} style={{ flex: 1 }} disabled={!ev.is_open} />
          <Btn title="Schedule" kind="outline" onPress={() => router.push(`/event/schedule/${ev.id}`)} style={{ flex: 0.6 }} />
        </View>
        {pending.length ? <><H2 style={{ marginTop: 8 }}>Waiting for approval ({pending.length})</H2>{pending.map(renderPost)}</> : null}
        <H2 style={{ marginTop: 8 }}>On the wall · {photoCount} {photoCount === 1 ? 'photo' : 'photos'}</H2>
        {moments.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
            <Chip label="All" on={tab === 'all'} onPress={() => setTab('all')} />
            {moments.map(m => <Chip key={m.id} label={`${m.time_label ? m.time_label + ' ' : ''}${m.name}`} on={tab === m.id} onPress={() => setTab(m.id)} />)}
            {live.some(p => !p.moment_id) ? <Chip label="Other" on={tab === 'none'} onPress={() => setTab('none')} /> : null}
          </ScrollView>
        ) : null}
        {!shown.length ? <Empty title={live.length ? 'Nothing in this moment yet' : 'Nothing added yet'} body="Share the QR code or link so guests can add theirs. Their photos and stories appear here as they’re added." /> : null}
        {shown.map(renderPost)}
      </Screen>

      <Modal visible={sheet === 'settings'} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSheet('none')}>
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
            {EXPIRY.map(x => <Chip key={x.key} label={x.label} on={x.key === 'never' ? expiryKey === 'never' : false} onPress={() => set({ link_expires_at: x.at(ev) })} />)}
          </View>
          {ev.link_expires_at ? <Small style={{ marginBottom: 8 }}>{expired ? 'Expired' : 'Works until'} {new Date(ev.link_expires_at).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</Small> : null}
          <Btn title="Make a new link" kind="outline" onPress={() => Alert.alert('Make a new link?', 'The old link and QR code will stop working. Guests who already added keep what they added.', [
            { text: 'Cancel', style: 'cancel' }, { text: 'New link', onPress: async () => { await newEventLink(ev.id); load(); } }])} />
          <H2 style={{ marginTop: 10 }}>Keep everything</H2>
          <Btn title="Download everything" kind="outline" onPress={async () => { try { await exportEvent(ev.id, ev.name); } catch (e: any) { Alert.alert('Could not download', e.message ?? ''); } }} />
          <Small style={{ marginBottom: 10 }}>All photos, voice recordings and stories in one file, ready to save or send.</Small>
          <Btn title="Done" onPress={() => setSheet('none')} />
          <Btn title="Delete event wall" kind="outline" onPress={() => Alert.alert('Delete this event wall?', 'Everything guests added will be removed. This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { setSheet('none'); await deleteEvent(ev.id); router.back(); } }])} />
        </ScrollView>
      </Modal>
      <Modal visible={sheet === 'add'} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSheet('none')}>
        <ScrollView style={{ backgroundColor: C.cream }} contentContainerStyle={{ padding: S.pad }} keyboardShouldPersistTaps="handled">
          <H1>Add to {ev.name}</H1>
          <P muted style={{ marginBottom: 10 }}>Your photos and stories go straight onto the wall.</P>
          {moments.length ? (<><Small style={{ marginBottom: 6 }}>Which moment?</Small>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{moments.map(m => <Chip key={m.id} label={m.name} on={postMoment === m.id} onPress={() => setPostMoment(postMoment === m.id ? null : m.id)} />)}</View></>) : null}
          <Composer draft={draft} setDraft={setDraft} prompt="What do you want everyone to remember?" />
          <Btn title="Add to the wall" onPress={addPost} busy={busy} disabled={!!(draft.recording || draft.processingAudio)} />
          <Btn kind="link" title="Cancel" onPress={() => setSheet('none')} />
        </ScrollView>
      </Modal>
    </>
  );
}
