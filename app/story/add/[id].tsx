import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert } from '@/lib/alert';
import { Screen, H1, P, Btn, Small } from '@/components/ui';
import { Composer, fromAsset } from '@/components/media';
import { Icon } from '@/components/icon';
import { addToStory, emptyDraft, type Draft } from '@/lib/api';
import { placeNames } from '@/lib/places';
import { groupPickedByPlaceAndDay } from '@/lib/moment-splits';
import { useUnsavedGuard } from '@/lib/use-unsaved-guard';
import { C, F } from '@/lib/theme';

export default function AddToStory() {
  const { id, title, shared, owner, mode: initialMode } = useLocalSearchParams<{ id: string; title?: string; shared?: string; owner?: string; mode?: string }>();
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [mode, setMode] = useState<'none' | 'write' | 'voice'>(
    initialMode === 'voice' || initialMode === 'write' ? initialMode : 'none',
  );
  const [pickedPlaces, setPickedPlaces] = useState<Record<string, string>>({});
  const [reviewMoments, setReviewMoments] = useState(false);
  const [skippedGroups, setSkippedGroups] = useState<string[]>([]);
  const [notifyOwner, setNotifyOwner] = useState(true);
  const [busy, setBusy] = useState(false);

  const allowExit = useUnsavedGuard(!busy && (draft.photos.length > 0 || !!draft.text.trim() || !!draft.audioUri));
  useEffect(() => {
    let active = true;
    const points = draft.photos.flatMap((p, index) => (
      p.lat != null && p.lng != null ? [{ id: `picked:${index}`, lat: p.lat, lng: p.lng }] : []
    ));
    placeNames(points).then(names => { if (active) setPickedPlaces(names); }).catch(() => {});
    return () => { active = false; };
  }, [draft.photos]);
  const groups = useMemo(() => groupPickedByPlaceAndDay(draft.photos, pickedPlaces), [draft.photos, pickedPlaces]);

  const pickPhotos = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 30, quality: 0.85, exif: true });
    if (!r.canceled) setDraft(cur => ({ ...cur, photos: [...cur.photos, ...r.assets.map(fromAsset)] }));
  };

  const toggleGroup = (key: string) => {
    setSkippedGroups(cur => cur.includes(key) ? cur.filter(x => x !== key) : [...cur, key]);
  };

  const save = async () => {
    if (busy) return;
    if (draft.recording || draft.processingAudio) return Alert.alert('Finish your recording first', 'Stop recording and wait for the words before saving.');
    const activePhotos = reviewMoments
      ? groups.filter(g => !skippedGroups.includes(g.key)).flatMap(g => g.photos)
      : draft.photos;
    if (!activePhotos.length && !draft.text.trim() && !draft.audioUri) {
      return Alert.alert('Add something first', 'Choose a photo, record your voice or write a few words.');
    }
    setBusy(true);
    try {
      await addToStory(id, { ...draft, photos: activePhotos });
      allowExit();
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (reviewMoments) {
    const count = groups.filter(g => !skippedGroups.includes(g.key)).reduce((n, g) => n + g.photos.length, 0);
    return (
      <Screen>
        <H1>Review and organise</H1>
        <P muted style={{ marginBottom: 14 }}>
          We’ve organised your {draft.photos.length} photos into {groups.length} {groups.length === 1 ? 'moment' : 'moments'}.
        </P>
        {groups.map(g => {
          const checked = !skippedGroups.includes(g.key);
          return (
            <Pressable key={g.key} onPress={() => toggleGroup(g.key)} style={[styles.momentCard, !checked && { opacity: 0.55 }]}>
              <View style={[styles.checkBox, checked && styles.checkBoxOn]}>
                {checked ? <Icon name="check" size={14} color="#FFF" /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 8 }}>
                  {g.photos.slice(0, 4).map((p, idx) => (
                    <Image key={p.uri + idx} source={{ uri: p.uri }} style={styles.momentThumb} contentFit="cover" />
                  ))}
                </ScrollView>
                <Text style={styles.momentTitle}>{g.label}</Text>
                <Small>{g.photos.length} {g.photos.length === 1 ? 'photo' : 'photos'}</Small>
              </View>
            </Pressable>
          );
        })}
        <Btn title={`Add to story (${count} photos)`} onPress={save} busy={busy} disabled={!count} style={{ marginTop: 12 }} />
        <Btn title="Back to edit" kind="link" onPress={() => setReviewMoments(false)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <H1>Add to {title ?? 'this story'}</H1>
      <P muted style={{ marginBottom: 12 }}>New photos, a new chapter, or your side of what happened.</P>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {draft.photos.map((p, i) => (
          <View key={p.uri + i} style={styles.stripItem}>
            <Image source={{ uri: p.uri }} style={styles.stripImg} contentFit="cover" />
            <Pressable onPress={() => setDraft(cur => ({ ...cur, photos: cur.photos.filter((_, j) => j !== i) }))} style={styles.stripRemove}>
              <Icon name="close" size={12} color={C.ink} />
            </Pressable>
          </View>
        ))}
        <Pressable onPress={pickPhotos} style={styles.stripAdd} accessibilityRole="button">
          <Icon name="plus" size={22} color={C.green} />
          <Text style={styles.stripAddText}>Add more photos</Text>
        </Pressable>
      </ScrollView>

      {draft.photos.length >= 2 && groups.length >= 2 ? (
        <Pressable onPress={() => setReviewMoments(true)} style={styles.organiseBanner}>
          <Icon name="stack" size={18} color={C.green} />
          <Text style={styles.organiseText}>Review & organise into {groups.length} moments</Text>
          <Icon name="forward" size={16} color={C.green} />
        </Pressable>
      ) : null}

      <Text style={styles.subhead}>Add to this story</Text>
      <Pressable onPress={() => setMode(m => m === 'write' ? 'none' : 'write')} style={[styles.optionCard, mode === 'write' && styles.optionCardOn]}>
        <View style={[styles.optionIcon, { backgroundColor: C.greenSoft }]}><Icon name="document" size={20} color={C.green} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.optionTitle}>Write a memory</Text>
          <Small>Add a caption, a story or a moment from your perspective.</Small>
        </View>
        <Icon name="forward" size={18} color={C.grey} />
      </Pressable>

      <Pressable onPress={() => setMode(m => m === 'voice' ? 'none' : 'voice')} style={[styles.optionCard, mode === 'voice' && styles.optionCardOn]}>
        <View style={[styles.optionIcon, { backgroundColor: '#FCEBE8' }]}><Icon name="mic" size={20} color="#C0533E" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.optionTitle}>Record a voice memory</Text>
          <Small>Capture the moment with your voice.</Small>
        </View>
        <Icon name="forward" size={18} color={C.grey} />
      </Pressable>

      {mode === 'voice' ? (
        <View style={styles.recorderBox}>
          <Composer draft={draft} setDraft={setDraft} hidePhotos hideText />
        </View>
      ) : null}

      <Text style={[styles.subhead, { marginTop: 10 }]}>A quick note <Text style={{ fontFamily: F.sans, color: C.grey }}>(optional)</Text></Text>
      <View style={styles.noteBox}>
        <TextInput value={draft.text} onChangeText={t => setDraft(cur => ({ ...cur, text: t.slice(0, 500) }))}
          multiline placeholder="Share a memory, add some context or tell your side of the story…"
          placeholderTextColor={C.faint} style={styles.noteInput} />
        <Text style={styles.counter}>{draft.text.length}/500</Text>
      </View>

      {shared === '1' ? (
        <View style={styles.notifyCard}>
          <Icon name="bell" size={20} color={C.green} />
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>Notify {owner || 'owner'}</Text>
            <Small>Let {owner || 'them'} know when you add to the story.</Small>
          </View>
          <Switch value={notifyOwner} onValueChange={setNotifyOwner} trackColor={{ true: C.green }} />
        </View>
      ) : null}

      <Small style={{ textAlign: 'center', marginTop: 10 }}>Your additions will appear in this story for invited people.</Small>
      <Btn title="Add to story  ›" onPress={save} busy={busy} disabled={!!(draft.recording || draft.processingAudio)} style={{ marginTop: 12 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  strip: { gap: 8, paddingVertical: 4, marginBottom: 14 },
  stripItem: { width: 82, height: 96, borderRadius: 12, overflow: 'hidden' },
  stripImg: { width: '100%', height: '100%' },
  stripRemove: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFFEB', alignItems: 'center', justifyContent: 'center' },
  stripAdd: { width: 90, height: 96, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  stripAddText: { fontFamily: F.sansMedium, fontSize: 11, color: C.navy, textAlign: 'center', marginTop: 4 },
  organiseBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.greenSoft, borderRadius: 12, padding: 12, marginBottom: 12 },
  organiseText: { flex: 1, fontFamily: F.sansMedium, fontSize: 13.5, color: C.green },
  subhead: { fontFamily: F.serif, fontSize: 19, color: C.navy, marginBottom: 8 },
  optionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 10 },
  optionCardOn: { borderColor: C.green },
  optionIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { fontFamily: F.sansBold, fontSize: 14.5, color: C.navy },
  recorderBox: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 10, marginBottom: 10 },
  noteBox: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, minHeight: 110 },
  noteInput: { fontFamily: F.sans, fontSize: 14.5, color: C.ink, minHeight: 74, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', fontFamily: F.sans, fontSize: 11.5, color: C.grey, marginTop: 4 },
  notifyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EBF2ED', borderRadius: 14, padding: 12, marginTop: 12 },
  momentCard: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 10 },
  checkBox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: C.grey, alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: C.green, borderColor: C.green },
  momentThumb: { width: 64, height: 64, borderRadius: 10 },
  momentTitle: { fontFamily: F.serif, fontSize: 18, color: C.navy },
});
