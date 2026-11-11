import { localDate, parseDate } from '@/lib/dates';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert } from '@/lib/alert';
import { takeHandOff } from '@/lib/handoff';
import { Btn, Chip, Field, P, Screen, Small } from '@/components/ui';
import { Composer, fromAsset } from '@/components/media';
import { Icon, type IconName } from '@/components/icon';
import { StoryLocationPicker } from '@/components/story-location';
import { addPerson, addToStory, createStory, emptyDraft, inviteCode, listPeople, listStories, setPeopleInStory, type Draft, type Person, type Story } from '@/lib/api';
import { shareStoryInvite } from '@/lib/invite-actions';
import { STORY_CATEGORIES, saveStoryPreference, type StoryCategory, type StoryLocation } from '@/lib/story-preferences';
import { useAuth } from '@/lib/auth';
import { useUnsavedGuard } from '@/lib/use-unsaved-guard';
import { C, F } from '@/lib/theme';

type CategoryTile = { label: string; icon: IconName; bg: string; color: string };
const CATEGORY_TILES: CategoryTile[] = [
  { label: 'Everyday life', icon: 'home', bg: '#EBF3EC', color: C.green },
  { label: 'Travel', icon: 'plane', bg: '#E4EEFC', color: '#1F5FD0' },
  { label: 'Celebrations', icon: 'star', bg: '#FBEAE8', color: '#D2382B' },
  { label: 'Family', icon: 'people', bg: '#E8F2EA', color: C.green },
  { label: 'Love & relationships', icon: 'heart', bg: '#FCEAE9', color: '#D2382B' },
  { label: 'Food & drink', icon: 'mic', bg: '#FCF1E2', color: '#B36B12' },
  { label: 'Nature', icon: 'pin', bg: '#E9F3EC', color: C.green },
  { label: 'Well-being', icon: 'star', bg: '#EBF2EE', color: C.green },
  { label: 'Hobbies', icon: 'tag', bg: '#FDF1E0', color: '#B36B12' },
  { label: 'Other', icon: 'more', bg: '#ECEEF2', color: C.navy },
];

const SHARE_MODES = [
  { key: 'view', label: 'View only', icon: 'lock' as const },
  { key: 'comment', label: 'Can comment', icon: 'document' as const },
  { key: 'add', label: 'Can add photos', icon: 'image' as const },
] as const;

export default function NewStory() {
  const { quick, private: priv, person } = useLocalSearchParams<{ quick?: string; private?: string; person?: string }>();
  const { session } = useAuth();
  const [hand] = useState(() => takeHandOff());
  const today = localDate();
  const [step, setStep] = useState<'details' | 'review'>('details');
  const [existingStories, setExistingStories] = useState<Story[]>([]);
  const [targetStoryId, setTargetStoryId] = useState<string | null>(null);
  const [title, setTitle] = useState(hand?.title ?? (quick ? `Today, ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : ''));
  const [draft, setDraft] = useState<Draft>(() => ({ ...emptyDraft(), photos: hand?.photos ?? [] }));
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [location, setLocation] = useState<StoryLocation | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [taggedIds, setTaggedIds] = useState<string[]>(person ? [person] : []);
  const [newPerson, setNewPerson] = useState('');
  const [openContext, setOpenContext] = useState<'none' | 'people' | 'location' | 'write' | 'voice'>(quick ? 'voice' : 'none');
  const [shareOn, setShareOn] = useState(false);
  const [shareMode, setShareMode] = useState<'view' | 'comment' | 'add'>('add');
  const [busy, setBusy] = useState(false);

  const allowExit = useUnsavedGuard(!busy && (draft.photos.length > 0 || !!draft.text.trim() || !!draft.audioUri));

  useEffect(() => {
    if (priv === '1') return;
    listStories().then(list => setExistingStories(list.filter(s => !s.private).slice(0, 3))).catch(() => {});
    listPeople().then(setPeople).catch(() => {});
  }, [priv]);

  const pickMore = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 30, quality: 0.85, exif: true });
    if (!r.canceled) setDraft(cur => ({ ...cur, photos: [...cur.photos, ...r.assets.map(fromAsset)] }));
  };

  const toggleCategory = (label: string) => {
    setSelectedCats(cur => cur.includes(label) ? cur.filter(x => x !== label) : cur.length >= 3 ? cur : [...cur, label]);
  };

  const createTaggedPerson = async () => {
    if (!newPerson.trim()) return;
    try {
      const pid = await addPerson(newPerson.trim());
      setPeople(await listPeople());
      setTaggedIds(cur => [...cur, pid]);
      setNewPerson('');
    } catch (e: any) { Alert.alert('Could not add person', e?.message ?? 'Try again.'); }
  };

  const goReview = () => {
    if (draft.recording || draft.processingAudio) return Alert.alert('Finish your recording first', 'Stop recording and wait for the words before continuing.');
    if (!draft.photos.length && !draft.text.trim() && !draft.audioUri) return Alert.alert('Add something first', 'Choose a photo, record your voice or write a few words.');
    setStep('review');
  };

  const save = async () => {
    if (busy) return;
    if (draft.recording || draft.processingAudio) return Alert.alert('Finish your recording first', 'Stop recording and wait for the words before saving.');
    if (!draft.photos.length && !draft.text.trim() && !draft.audioUri) return Alert.alert('Add something first', 'Choose a photo, record your voice or write a few words.');
    setBusy(true);
    const date = (draft.photos.find(p => p.takenAt)?.takenAt ? localDate(parseDate(draft.photos.find(p => p.takenAt)!.takenAt!)) : null) ?? today;
    try {
      let id = targetStoryId;
      if (id) {
        await addToStory(id, draft);
      } else {
        id = await createStory(title, date, draft, { private: priv === '1' });
      }
      if (taggedIds.length) await setPeopleInStory(id, taggedIds).catch(() => {});
      const primaryCategory = selectedCats.find((c): c is StoryCategory => (STORY_CATEGORIES as readonly string[]).includes(c));
      const extraTags = selectedCats.filter(c => c !== primaryCategory);
      if (session?.user.id && (primaryCategory || extraTags.length || location)) {
        await saveStoryPreference(session.user.id, id, {
          ...(primaryCategory ? { category: primaryCategory } : {}),
          ...(extraTags.length ? { tags: extraTags } : {}),
          ...(location ? { location } : {}),
        }).catch(() => Alert.alert('Story saved', 'Category or location could not be saved on this device.'));
      }
      if (shareOn && priv !== '1') {
        try {
          const code = await inviteCode(id);
          await shareStoryInvite(targetStoryName || title || 'Whole Story', code);
        } catch { /* Story already saved; user can also invite from story screen */ }
      }
      allowExit();
      router.replace(`/story/${id}`);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const targetStoryName = existingStories.find(s => s.id === targetStoryId)?.title ?? '';
  const displayTitle = targetStoryId ? targetStoryName : (title.trim() || 'Untitled story');

  if (step === 'review') {
    const heroPhoto = draft.photos[0];
    return (
      <Screen>
        <View style={styles.reviewTop}>
          <Pressable onPress={() => setStep('details')} hitSlop={10} style={styles.circleBtn} accessibilityRole="button" accessibilityLabel="Back to edit">
            <Icon name="back" size={22} color={C.navy} />
          </Pressable>
          <Text style={styles.reviewHeading}>Review story</Text>
          <Pressable onPress={save} disabled={busy} style={styles.savePill} accessibilityRole="button">
            <Text style={styles.savePillText}>{busy ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>

        {heroPhoto ? (
          <Pressable onPress={() => setStep('details')} style={styles.heroWrap}>
            <Image source={{ uri: heroPhoto.uri }} style={styles.heroImage} contentFit="cover" />
            <View style={styles.editPhotosBadge}>
              <Icon name="image" size={14} color="#FFF" />
              <Text style={styles.editPhotosText}>Edit photos ({draft.photos.length})</Text>
            </View>
          </Pressable>
        ) : null}

        <Text style={styles.reviewTitle}>{displayTitle}</Text>
        <View style={styles.metaRow}>
          {location ? <View style={styles.metaPill}><Icon name="pin" size={13} color={C.navy} /><Text style={styles.metaPillText}>Custom place</Text></View> : null}
          {selectedCats.map(c => <View key={c} style={[styles.metaPill, { backgroundColor: C.greenSoft }]}><Text style={[styles.metaPillText, { color: C.green }]}>{c}</Text></View>)}
        </View>

        {taggedIds.length ? (
          <View style={styles.peopleChips}>
            {people.filter(p => taggedIds.includes(p.id)).map(p => (
              <View key={p.id} style={styles.personAvatar}><Text style={styles.personInitial}>{p.name[0]?.toUpperCase()}</Text></View>
            ))}
            <Small style={{ alignSelf: 'center', marginLeft: 4 }}>
              {people.filter(p => taggedIds.includes(p.id)).map(p => p.name).join(', ')}
            </Small>
          </View>
        ) : null}

        {draft.text.trim() ? <P style={{ marginTop: 10 }}>{draft.text.trim()}</P> : null}
        {draft.transcript?.trim() ? <P muted style={{ marginTop: 6, fontStyle: 'italic' }}>“{draft.transcript.trim()}”</P> : null}
        {draft.audioUri ? (
          <View style={styles.voicePreview}>
            <View style={styles.playDot}><Icon name="mic" size={16} color="#FFF" /></View>
            <Text style={styles.voicePreviewText}>Voice recording attached · {Math.max(1, Math.round(draft.durationMs / 1000))}s</Text>
          </View>
        ) : null}

        {priv !== '1' ? (
          <View style={styles.shareBox}>
            <Text style={styles.shareTitle}>Share this story</Text>
            <Small>Choose whether to invite others to view, comment or add photos.</Small>
            <View style={styles.shareToggleRow}>
              <Text style={styles.shareLabel}>Share with others</Text>
              <Switch value={shareOn} onValueChange={setShareOn} trackColor={{ true: C.green }} />
            </View>
            {shareOn ? (
              <View style={styles.permRow}>
                {SHARE_MODES.map(m => {
                  const active = shareMode === m.key;
                  return (
                    <Pressable key={m.key} onPress={() => setShareMode(m.key)} style={[styles.permCard, active && styles.permCardOn]}>
                      <Icon name={m.icon} size={18} color={active ? C.green : C.navy} />
                      <Text style={[styles.permLabel, active && { color: C.green }]}>{m.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {shareOn ? <Small style={{ marginTop: 6 }}>An invitation sheet will open right after saving.</Small> : null}
          </View>
        ) : null}

        <Btn title={busy ? 'Saving…' : 'Save story'} onPress={save} busy={busy} style={{ marginTop: 16 }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.pageTitle}>{quick ? 'What made today special?' : priv === '1' ? 'A private story' : 'Add to story'}</Text>
      {quick ? <P muted style={{ marginBottom: 10 }}>Say it in your own words. It takes a few seconds.</P> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>
        {draft.photos.map((p, i) => (
          <View key={p.uri + i} style={styles.stripItem}>
            <Image source={{ uri: p.uri }} style={styles.stripImg} contentFit="cover" />
            <Pressable onPress={() => setDraft(cur => ({ ...cur, photos: cur.photos.filter((_, j) => j !== i) }))} style={styles.stripRemove} accessibilityLabel="Remove photo">
              <Icon name="close" size={12} color={C.ink} />
            </Pressable>
          </View>
        ))}
        <Pressable onPress={pickMore} style={styles.stripAdd} accessibilityRole="button" accessibilityLabel="Add photos">
          <Icon name="plus" size={22} color={C.green} />
          <Text style={styles.stripAddText}>Photos</Text>
        </Pressable>
      </ScrollView>

      {priv !== '1' && !quick && existingStories.length > 0 ? (
        <View style={{ marginBottom: 14 }}>
          <Text style={styles.sectionLabel}>Add to an existing story</Text>
          {existingStories.map(s => {
            const active = targetStoryId === s.id;
            return (
              <Pressable key={s.id} onPress={() => setTargetStoryId(active ? null : s.id)}
                style={[styles.existingCard, active && styles.existingCardOn]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.existingTitle} numberOfLines={1}>{s.title}</Text>
                  <Small>{s.entryCount ?? 0} chapters · {s.photoCount ?? 0} photos</Small>
                </View>
                <Icon name={active ? 'check' : 'forward'} size={18} color={active ? C.green : C.grey} />
              </Pressable>
            );
          })}
          <Text style={styles.orText}>OR</Text>
        </View>
      ) : null}

      {!targetStoryId ? (
        <Field label={priv === '1' ? 'Private story name' : 'Create a new story'} value={title} onChangeText={setTitle} placeholder="e.g. Lake Como getaway" />
      ) : null}

      <Text style={styles.sectionLabel}>Category <Text style={{ fontFamily: F.sans, color: C.grey }}>(choose up to 3)</Text></Text>
      <View style={styles.catGrid}>
        {CATEGORY_TILES.map(cat => {
          const active = selectedCats.includes(cat.label);
          return (
            <Pressable key={cat.label} onPress={() => toggleCategory(cat.label)}
              style={[styles.catTile, { backgroundColor: cat.bg }, active && styles.catTileOn]}>
              <Icon name={cat.icon} size={20} color={cat.color} />
              <Text style={styles.catLabel} numberOfLines={2}>{cat.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Add more context <Text style={{ fontFamily: F.sans, color: C.grey }}>(optional)</Text></Text>
      <View style={styles.ctxGrid}>
        {priv !== '1' ? (
          <Pressable onPress={() => setOpenContext(c => c === 'people' ? 'none' : 'people')} style={[styles.ctxCard, openContext === 'people' && styles.ctxCardOn]}>
            <Icon name="people" size={18} color={C.green} />
            <View style={{ flex: 1 }}><Text style={styles.ctxTitle}>Tag people</Text><Text style={styles.ctxSub} numberOfLines={1}>{taggedIds.length ? `${taggedIds.length} tagged` : 'Mum, Alex, Leo…'}</Text></View>
          </Pressable>
        ) : null}
        {priv !== '1' ? (
          <Pressable onPress={() => setOpenContext(c => c === 'location' ? 'none' : 'location')} style={[styles.ctxCard, openContext === 'location' && styles.ctxCardOn]}>
            <Icon name="pin" size={18} color="#1F5FD0" />
            <View style={{ flex: 1 }}><Text style={styles.ctxTitle}>Add location</Text><Text style={styles.ctxSub} numberOfLines={1}>{location ? 'Location set' : 'e.g. Lake Como'}</Text></View>
          </Pressable>
        ) : null}
        <Pressable onPress={() => setOpenContext(c => c === 'write' ? 'none' : 'write')} style={[styles.ctxCard, openContext === 'write' && styles.ctxCardOn]}>
          <Icon name="document" size={18} color={C.navy} />
          <View style={{ flex: 1 }}><Text style={styles.ctxTitle}>Write a memory</Text><Text style={styles.ctxSub} numberOfLines={1}>{draft.text.trim() ? 'Added' : 'Add a caption or story'}</Text></View>
        </Pressable>
        <Pressable onPress={() => setOpenContext(c => c === 'voice' ? 'none' : 'voice')} style={[styles.ctxCard, openContext === 'voice' && styles.ctxCardOn]}>
          <Icon name="mic" size={18} color="#C0533E" />
          <View style={{ flex: 1 }}><Text style={styles.ctxTitle}>Record voice</Text><Text style={styles.ctxSub} numberOfLines={1}>{draft.audioUri ? 'Recorded' : 'Capture the moment'}</Text></View>
        </Pressable>
      </View>

      {openContext === 'people' && priv !== '1' ? (
        <View style={styles.panel}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {people.map(p => <Chip key={p.id} label={p.name} on={taggedIds.includes(p.id)}
              onPress={() => setTaggedIds(cur => cur.includes(p.id) ? cur.filter(x => x !== p.id) : [...cur, p.id])} />)}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <View style={{ flex: 1 }}><Field value={newPerson} onChangeText={setNewPerson} placeholder="Add someone new" /></View>
            <Btn title="Add" kind="outline" onPress={createTaggedPerson} style={{ marginTop: 0 }} />
          </View>
        </View>
      ) : null}

      {openContext === 'location' && priv !== '1' ? (
        <StoryLocationPicker value={location} onChange={setLocation} disabled={busy} />
      ) : null}

      {openContext === 'write' ? (
        <View style={styles.panel}>
          <Composer draft={draft} setDraft={setDraft} prompt={hand?.prompt} hidePhotos hideVoice />
        </View>
      ) : null}

      {openContext === 'voice' ? (
        <View style={styles.panel}>
          <Composer draft={draft} setDraft={setDraft} prompt={hand?.prompt} hidePhotos />
        </View>
      ) : null}

      <Small style={{ marginTop: 10 }}>ⓘ The date will be added automatically from your photos.</Small>
      <Btn title="Next  ›" onPress={goReview} disabled={!!(draft.recording || draft.processingAudio)} style={{ marginTop: 12 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pageTitle: { fontFamily: F.serif, fontSize: 28, color: C.navy, marginBottom: 12 },
  photoStrip: { gap: 8, paddingVertical: 4, marginBottom: 14 },
  stripItem: { width: 72, height: 72, borderRadius: 12, overflow: 'hidden' },
  stripImg: { width: '100%', height: '100%' },
  stripRemove: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFFEB', alignItems: 'center', justifyContent: 'center' },
  stripAdd: { width: 72, height: 72, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.green, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' },
  stripAddText: { fontFamily: F.sansMedium, fontSize: 11, color: C.green, marginTop: 2 },
  sectionLabel: { fontFamily: F.sansBold, fontSize: 14, color: C.navy, marginBottom: 8 },
  existingCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 8 },
  existingCardOn: { borderColor: C.green, backgroundColor: C.greenSoft },
  existingTitle: { fontFamily: F.serif, fontSize: 17, color: C.navy },
  orText: { textAlign: 'center', fontFamily: F.sansMedium, fontSize: 12, color: C.grey, marginVertical: 4 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catTile: { width: '31.5%', minHeight: 68, borderRadius: 14, padding: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent', gap: 5 },
  catTileOn: { borderColor: C.green },
  catLabel: { fontFamily: F.sansMedium, fontSize: 11.5, color: C.ink, textAlign: 'center' },
  ctxGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ctxCard: { width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 11 },
  ctxCardOn: { borderColor: C.green, backgroundColor: C.greenSoft },
  ctxTitle: { fontFamily: F.sansBold, fontSize: 12.5, color: C.navy },
  ctxSub: { fontFamily: F.sans, fontSize: 11, color: C.grey, marginTop: 1 },
  panel: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12, marginTop: 10 },
  reviewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  circleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  reviewHeading: { fontFamily: F.serif, fontSize: 22, color: C.navy },
  savePill: { backgroundColor: C.green, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8 },
  savePillText: { fontFamily: F.sansMedium, fontSize: 14, color: '#FFF' },
  heroWrap: { borderRadius: 18, overflow: 'hidden', marginBottom: 14 },
  heroImage: { width: '100%', height: 220 },
  editPhotosBadge: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(15,27,51,0.75)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  editPhotosText: { fontFamily: F.sansMedium, fontSize: 12, color: '#FFF' },
  reviewTitle: { fontFamily: F.serif, fontSize: 30, color: C.navy },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECE6DB', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  metaPillText: { fontFamily: F.sansMedium, fontSize: 12, color: C.ink },
  peopleChips: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  personAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' },
  personInitial: { fontFamily: F.serif, fontSize: 15, color: C.green },
  voicePreview: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, marginTop: 10 },
  playDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  voicePreviewText: { fontFamily: F.sansMedium, fontSize: 13.5, color: C.navy },
  shareBox: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14, marginTop: 16 },
  shareTitle: { fontFamily: F.serif, fontSize: 18, color: C.navy },
  shareToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  shareLabel: { fontFamily: F.sansBold, fontSize: 14, color: C.ink },
  permRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  permCard: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.cream, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', gap: 4 },
  permCardOn: { borderColor: C.green, backgroundColor: C.greenSoft },
  permLabel: { fontFamily: F.sansMedium, fontSize: 11.5, color: C.ink, textAlign: 'center' },
});
