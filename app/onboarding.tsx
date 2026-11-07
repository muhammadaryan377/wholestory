import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ML from 'expo-media-library/legacy';
import type { PurchasesPackage } from 'react-native-purchases';
import { Alert } from '@/lib/alert';
import { useAuth } from '@/lib/auth';
import { myName, saveName, saveProfileChoices } from '@/lib/api';
import { findSuggestions, libraryAllowed, countPhotos, type Suggestion } from '@/lib/suggest';
import { saveNamedMoments, markSetupComplete } from '@/lib/moment-groups';
import { chooseLocalProfilePhoto, readLocalProfilePhoto } from '@/lib/profile-photo';
import { getPrefs, setPrefs } from '@/lib/notify';
import { buy, configurePayments, getPackages, restore, PAYMENTS_ENABLED } from '@/lib/payments';
import { Btn, Chip, Thread, ToggleRow } from '@/components/ui';
import { C, F } from '@/lib/theme';

const INTERESTS = ['Family', 'Couples', 'Travel', 'Friends', 'Events', 'Everyday life', 'Pets', 'Milestones'];
const LABELS = ['Profile', 'Photos', 'Moments', 'Plan'];
type MomentGroup = { id: string; title: string; assets: ML.Asset[] };
type Editing = { id: string | null; title: string; selectedIds: string[] };
const dateLabel = (value: number) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const unique = (assets: ML.Asset[]) => [...new Map(assets.map(asset => [asset.id, asset])).values()];

function Progress({ active }: { active: number }) {
  return <View style={styles.progress}>
    {LABELS.map((label, i) => (
      <View key={label} style={styles.progressStep}>
        <View style={[styles.progressCircle, { backgroundColor: i <= active ? C.green : '#D9D6D0' }]}>
          <Text style={styles.progressNumber}>{i < active ? '✓' : i + 1}</Text>
        </View>
        <Text style={[styles.progressLabel, { color: i <= active ? C.green : C.faint }]}>{label}</Text>
      </View>
    ))}
  </View>;
}

const SAMPLE_PHOTOS = {
  travel: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=500&q=75',
  memory: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=500&q=75',
  people: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=500&q=75',
};
function IntroPhotoCards() {
  // Optional sample photography. Each card has an offline fallback, and
  // actual moment thumbnails always come from the user's photo library.
  const art = [
    { emoji: '🏖️', label: 'Travel', bg: '#DFEAE2', uri: SAMPLE_PHOTOS.travel },
    { emoji: '☀️', label: 'Memories', bg: '#F8E3D5', uri: SAMPLE_PHOTOS.memory },
    { emoji: '👨‍👩‍👧', label: 'People', bg: '#E5E9EF', uri: SAMPLE_PHOTOS.people },
  ];
  return <View style={styles.photoCards} accessibilityLabel="Sample photographs for stories">
    {art.map((a, i) =>
      <View key={a.label} style={[styles.artCard, { backgroundColor: a.bg, marginTop: i === 1 ? 0 : 23, transform: [{ rotate: i === 0 ? '-6deg' : i === 2 ? '6deg' : '0deg' }] }]}>
        <Text style={{ fontSize: 43 }}>{a.emoji}</Text>
        <Image source={{ uri: a.uri }} style={{ ...StyleSheet.absoluteFillObject, borderRadius: 13 }} contentFit="cover" transition={150} />
      </View>)}
  </View>;
}

function GroupCard({ group, onEdit }: { group: MomentGroup; onEdit: () => void }) {
  const sorted = group.assets.slice().sort((a, b) => a.creationTime - b.creationTime);
  return <Pressable accessibilityRole="button" accessibilityLabel={'Edit moment ' + group.title} onPress={onEdit}
    style={({ pressed }) => [styles.groupCard, pressed && { opacity: 0.8 }]}>
    <View style={{ flex: 1, paddingRight: 10, gap: 3 }}>
      <Text style={styles.groupTitle} numberOfLines={2}>{group.title}</Text>
      <Text style={styles.smallText}>{group.assets.length} photos</Text>
      {sorted.length ? <Text style={styles.groupDate}>{dateLabel(sorted[0].creationTime)}{sorted.length > 1 ? ' – ' + dateLabel(sorted[sorted.length - 1].creationTime) : ''}</Text> : null}
      <Text style={styles.editHint}>Tap to rename or edit photos</Text>
    </View>
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {group.assets.slice(0, 2).map(a =>
        <Image key={a.id} source={{ uri: a.uri }} style={styles.groupThumb} contentFit="cover" />)}
    </View>
    <Text style={{ fontSize: 20, color: C.green, marginLeft: 4 }}>›</Text>
  </Pressable>;
}

export default function Onboarding() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { width } = useWindowDimensions();
  const photoSize = Math.max(76, Math.floor((width - 62) / 3));
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(['Family']);
  const [morning, setMorning] = useState(true);
  const [totalPhotos, setTotalPhotos] = useState<number | null>(null);
  const [photoAccess, setPhotoAccess] = useState(false);
  const [groups, setGroups] = useState<MomentGroup[]>([]);
  const [editor, setEditor] = useState<Editing | null>(null);
  const [gallery, setGallery] = useState<ML.Asset[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [packageIndex, setPackageIndex] = useState(0);
  const [packageBusy, setPackageBusy] = useState(false);
  const [packageError, setPackageError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    Promise.all([myName(), readLocalProfilePhoto(userId)]).then(([savedName, photo]) => {
      if (alive) { setName(savedName); setAvatar(photo); }
    }).catch(() => {});
    return () => { alive = false; };
  }, [userId]);

  useEffect(() => {
    if (step !== 3 || !PAYMENTS_ENABLED || !userId) return;
    let alive = true;
    setPackageBusy(true);
    configurePayments(userId).then(getPackages).then(list => {
      if (!alive) return;
      const available = list.filter(p => p.packageType === 'ANNUAL' || p.packageType === 'MONTHLY');
      setPackages(available);
      const year = available.findIndex(p => p.packageType === 'ANNUAL');
      setPackageIndex(year >= 0 ? year : 0);
    }).catch(reason => { if (alive) setPackageError(reason instanceof Error ? reason.message : 'Unable to load plans.'); })
      .finally(() => { if (alive) setPackageBusy(false); });
    return () => { alive = false; };
  }, [step, userId]);

  const loadGallery = async (reset = false) => {
    if (galleryBusy) return;
    setGalleryBusy(true);
    try {
      const next = await ML.getAssetsAsync({
        mediaType: 'photo', sortBy: [['creationTime', false]],
        first: 60, ...(reset || !cursor ? {} : { after: cursor }),
      });
      setGallery(previous => reset ? next.assets : unique([...previous, ...next.assets]));
      setCursor(next.endCursor);
      setHasMore(next.hasNextPage);
    } catch (reason) {
      Alert.alert('Could not load photos', reason instanceof Error ? reason.message : 'Try again.');
    } finally { setGalleryBusy(false); }
  };

  const completeSetup = async () => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      await saveNamedMoments(userId, groups.map(group => ({
        id: group.id, title: group.title, assetIds: group.assets.map(a => a.id),
      })));
      await markSetupComplete(userId);
      router.replace('/(tabs)');
    } catch (reason) {
      Alert.alert('Could not finish setup', reason instanceof Error ? reason.message : 'Please try again.');
    } finally { setBusy(false); }
  };

  const saveProfile = async () => {
    if (!userId || busy) return;
    if (!name.trim()) return Alert.alert('Add your name', 'Please enter a name to personalise your profile.');
    setBusy(true);
    try {
      await saveName(name.trim());
      await saveProfileChoices(picked, morning);
      const preferences = await getPrefs();
      await setPrefs({ ...preferences, memories: morning });
      setStep(1);
    } catch (reason) {
      Alert.alert('Could not save your profile', reason instanceof Error ? reason.message : 'Try again.');
    } finally { setBusy(false); }
  };

  const chooseAvatar = async () => {
    if (!userId) return;
    try {
      const pickedPhoto = await chooseLocalProfilePhoto(userId);
      if (pickedPhoto) setAvatar(pickedPhoto);
    } catch (reason) {
      Alert.alert('Could not save photo', reason instanceof Error ? reason.message : 'Try again.');
    }
  };

  const allowPhotos = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const allowed = await libraryAllowed(true);
      if (!allowed) return Alert.alert('Photo access not allowed', 'You can continue without photos or allow access later in Settings.');
      const [count, suggestions] = await Promise.all([countPhotos(), findSuggestions(30)]);
      setTotalPhotos(count);
      setPhotoAccess(true);
      setGroups(suggestions.map((s: Suggestion) => ({ id: s.id.startsWith('named-') ? s.id.slice(6) : s.id, title: s.title, assets: s.assets })));
      setStep(2);
      void loadGallery(true);
    } catch (reason) {
      Alert.alert('Could not read photos', reason instanceof Error ? reason.message : 'Try again, or select Not now.');
    } finally { setBusy(false); }
  };

  const openEditor = (group?: MomentGroup) => {
    setEditor({
      id: group?.id ?? null, title: group?.title ?? '',
      selectedIds: group?.assets.map(asset => asset.id) ?? [],
    });
  };

  const saveEditor = async () => {
    if (!editor || !userId || busy) return;
    if (!editor.title.trim()) return Alert.alert('Name this moment', 'Enter a group name, such as Sunday breakfast.');
    if (!editor.selectedIds.length) return Alert.alert('Choose photos', 'Select at least one photo for this group.');
    const allAssets = unique([...gallery, ...groups.flatMap(group => group.assets)]);
    const byId = new Map(allAssets.map(asset => [asset.id, asset]));
    const assets = editor.selectedIds.map(id => byId.get(id)).filter((a): a is ML.Asset => !!a);
    if (!assets.length) return Alert.alert('Photos unavailable', 'Please load your photos again.');
    const ids = new Set(assets.map(asset => asset.id));
    const nextGroup = { id: editor.id || 'custom-' + Date.now(), title: editor.title.trim(), assets };
    const otherGroups = groups.filter(group => group.id !== editor.id)
      .map(group => ({ ...group, assets: group.assets.filter(asset => !ids.has(asset.id)) }))
      .filter(group => group.assets.length);
    const nextGroups = editor.id && groups.some(group => group.id === editor.id)
      ? [...otherGroups, nextGroup]
      : [...groups.map(group => ({ ...group, assets: group.assets.filter(asset => !ids.has(asset.id)) })).filter(group => group.assets.length), nextGroup];
    setBusy(true);
    try {
      await saveNamedMoments(userId, nextGroups.map(group => ({ id: group.id, title: group.title, assetIds: group.assets.map(a => a.id) })));
      setGroups(nextGroups);
      setEditor(null);
    } catch (reason) {
      Alert.alert('Could not save this group', reason instanceof Error ? reason.message : 'Try again.');
    } finally { setBusy(false); }
  };

  const deleteGroup = () => {
    if (!editor?.id || !userId || busy) return;
    Alert.alert('Remove this group?', 'Your photos will stay in your gallery. Only the suggested group will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove group', style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          const remaining = groups.filter(group => group.id !== editor.id);
          await saveNamedMoments(userId, remaining.map(group => ({
            id: group.id, title: group.title, assetIds: group.assets.map(a => a.id),
          })));
          setGroups(remaining);
          setEditor(null);
        } catch (reason) {
          Alert.alert('Could not remove group', reason instanceof Error ? reason.message : 'Try again.');
        } finally { setBusy(false); }
      } },
    ]);
  };

  const buyPlan = async () => {
    if (!packages[packageIndex] || busy) return;
    setBusy(true);
    try {
      if (await buy(packages[packageIndex])) await completeSetupAfterPurchase();
    } catch (reason: any) {
      if (!reason?.userCancelled) Alert.alert('Could not subscribe', reason instanceof Error ? reason.message : 'Try again.');
    } finally { setBusy(false); }
  };

  const completeSetupAfterPurchase = async () => {
    if (!userId) return;
    await saveNamedMoments(userId, groups.map(group => ({ id: group.id, title: group.title, assetIds: group.assets.map(a => a.id) })));
    await markSetupComplete(userId);
    router.replace('/(tabs)');
  };

  const restorePlan = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (await restore()) await completeSetupAfterPurchase();
      else Alert.alert('No purchases found', 'There are no active Whole Stories subscriptions to restore.');
    } catch (reason) {
      Alert.alert('Could not restore', reason instanceof Error ? reason.message : 'Try again.');
    } finally { setBusy(false); }
  };

  const selectedGroup = groups.find(group => group.id === editor?.id);
  const editorAssets = unique([...(selectedGroup?.assets ?? []), ...gallery]);

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back"
          disabled={busy || (step === 0 && !editor)}
          onPress={() => editor ? setEditor(null) : setStep(previous => previous === 3 && !photoAccess ? 1 : Math.max(0, previous - 1))}
          style={[styles.back, (step === 0 && !editor) && { opacity: 0 }]}>
          <Text style={{ fontSize: 26, color: C.green }}>‹</Text>
        </Pressable>
        <Text style={styles.brand}>Whole Stories</Text>
        <Thread width={98} />
      </View>
      <Progress active={step} />

      {editor ? <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>{editor.id ? 'Edit your moment' : 'Create a moment'}</Text>
        <Text style={styles.paragraph}>Give this group a name and choose the photos that belong together. You can change it later.</Text>
        <Text style={styles.label}>Moment name</Text>
        <TextInput style={styles.input} autoCapitalize="sentences" maxLength={90} placeholder="e.g. Sunday breakfast"
          placeholderTextColor={C.faint} value={editor.title}
          onChangeText={title => setEditor(previous => previous ? { ...previous, title } : previous)} />
        <View style={styles.galleryHeading}>
          <Text style={styles.label}>{editor.selectedIds.length} photos selected</Text>
          <Pressable accessibilityRole="button" onPress={() => setEditor(previous => previous ? { ...previous, selectedIds: [] } : previous)}>
            <Text style={styles.editHint}>Clear selection</Text>
          </Pressable>
        </View>
        <View style={styles.galleryGrid}>
          {editorAssets.map(asset => {
            const chosen = editor.selectedIds.includes(asset.id);
            return <Pressable key={asset.id} accessibilityRole="checkbox" accessibilityState={{ checked: chosen }}
              accessibilityLabel={chosen ? 'Remove selected photo' : 'Select photo'}
              onPress={() => setEditor(previous => {
                if (!previous) return previous;
                return { ...previous, selectedIds: chosen ? previous.selectedIds.filter(id => id !== asset.id) : [...previous.selectedIds, asset.id] };
              })}
              style={{ width: photoSize, height: photoSize, borderRadius: 12, overflow: 'hidden', marginBottom: 6 }}>
              <Image source={{ uri: asset.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              <View style={[styles.selectionBadge, { backgroundColor: chosen ? C.green : '#FFFFFFCC' }]}>
                <Text style={{ color: chosen ? '#FFF' : C.navy, fontFamily: F.sansBold, fontSize: 12 }}>{chosen ? '✓' : '+'}</Text>
              </View>
            </Pressable>;
          })}
        </View>
        {hasMore ? <Btn title={galleryBusy ? 'Loading…' : 'Load more photos'} kind="outline" busy={galleryBusy} onPress={() => loadGallery()} /> : null}
        {galleryBusy && !editorAssets.length ? <ActivityIndicator color={C.green} /> : null}
        <Text style={styles.note}>Photos stay on your device until you explicitly add them to a story.</Text>
        {editor.id ? <Pressable accessibilityRole="button" onPress={deleteGroup} style={{ padding: 12, alignItems: 'center', marginTop: 12 }}>
          <Text style={{ color: C.red, fontFamily: F.sansMedium }}>Remove this group</Text>
        </Pressable> : null}
      </ScrollView> :
      <ScrollView key={step} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 0 ? <>
          <Text style={styles.heading}>Tell us about you</Text>
          <Text style={styles.paragraph}>A few details to personalise your Whole Stories experience.</Text>
          <View style={{ alignItems: 'center', marginVertical: 16 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Choose a profile photo" onPress={chooseAvatar} style={styles.avatar}>
              {avatar ? <Image source={{ uri: avatar }} style={{ width: 110, height: 110, borderRadius: 55 }} contentFit="cover" /> :
                <Text style={{ fontFamily: F.serif, fontSize: 48, color: C.navy }}>{name.trim().charAt(0).toUpperCase() || 'W'}</Text>}
              <View style={styles.cameraBadge}><Text style={{ color: '#FFF', fontSize: 18 }}>＋</Text></View>
            </Pressable>
            <Text style={styles.note}>Optional profile photo · stored on this device</Text>
          </View>
          <Text style={styles.label}>What should we call you?</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" maxLength={80}
            autoCapitalize="words" autoComplete="name" placeholderTextColor={C.faint} />
          <Text style={[styles.label, { marginTop: 18, marginBottom: 10 }]}>What kind of moments do you want to remember?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {INTERESTS.map(t => <Chip key={t} label={t} on={picked.includes(t)}
              onPress={() => setPicked(previous => previous.includes(t) ? previous.filter(x => x !== t) : [...previous, t])} />)}
          </View>
          <View style={{ marginTop: 16 }}>
            <ToggleRow title="Morning memory" sub="A gentle 'On this day' reminder each morning" value={morning} onChange={setMorning} />
          </View>
        </> : null}

        {step === 1 ? <>
          <Text style={styles.heading}>Add your photos</Text>
          <Text style={styles.paragraph}>Choose which photos to explore. We’ll suggest groups by date and time, then you decide what to keep.</Text>
          <IntroPhotoCards />
          <View style={styles.benefit}><Text style={styles.benefitIcon}>♧</Text><View style={{ flex: 1 }}><Text style={styles.benefitTitle}>Private by default</Text><Text style={styles.smallText}>Nothing is uploaded until you choose to create a story.</Text></View></View>
          <View style={styles.benefit}><Text style={styles.benefitIcon}>✓</Text><View style={{ flex: 1 }}><Text style={styles.benefitTitle}>You're in control</Text><Text style={styles.smallText}>Rename groups, add or remove photos, or skip this step.</Text></View></View>
          <View style={styles.benefit}><Text style={styles.benefitIcon}>◎</Text><View style={{ flex: 1 }}><Text style={styles.benefitTitle}>No AI or location tracking</Text><Text style={styles.smallText}>Photos are grouped on your phone using their dates and times.</Text></View></View>
        </> : null}

        {step === 2 ? <>
          <Text style={styles.heading}>We found {totalPhotos === null ? 'your' : totalPhotos.toLocaleString('en-GB')} photos</Text>
          <Text style={styles.paragraph}>Review suggested moments, rename them and choose which photos belong together. Only photos you allow are visible here.</Text>
          {groups.length ? groups.map(group => <GroupCard key={group.id} group={group} onEdit={() => openEditor(group)} />) :
            <View style={styles.empty}><Text style={styles.benefitTitle}>No suggested moments yet</Text><Text style={styles.smallText}>Create your own group by selecting photos below.</Text></View>}
          <Btn title="+ Create your own group" kind="outline" onPress={() => openEditor()} />
          <Text style={[styles.note, { marginTop: 8 }]}>Names are yours to edit. We never guess a city or event from a picture.</Text>
        </> : null}

        {step === 3 ? <>
          <Text style={styles.heading}>Keep every story growing</Text>
          <Text style={styles.paragraph}>{PAYMENTS_ENABLED ? 'Choose the plan that works for your stories.' : 'You’re all set. Subscription purchases are disabled in this test build.'}</Text>
          <View style={styles.planArt}>
            <View style={[styles.planPhoto, { backgroundColor: '#E5EEDC', transform: [{ rotate: '-5deg' }] }]}>
              <Text style={{ fontSize: 43 }}>🌄</Text>
              <Image source={{ uri: SAMPLE_PHOTOS.travel }} style={{ ...StyleSheet.absoluteFillObject, borderRadius: 12 }} contentFit="cover" transition={150} />
            </View>
            <View style={[styles.planPhoto, { backgroundColor: '#F3E0D2', transform: [{ rotate: '6deg' }] }]}>
              <Text style={{ fontSize: 43 }}>💛</Text>
              <Image source={{ uri: SAMPLE_PHOTOS.people }} style={{ ...StyleSheet.absoluteFillObject, borderRadius: 12 }} contentFit="cover" transition={150} />
            </View>
          </View>
          {PAYMENTS_ENABLED ? <>
            {packageBusy ? <ActivityIndicator color={C.green} /> : null}
            {packageError ? <Text accessibilityRole="alert" style={styles.error}>{packageError}</Text> : null}
            {packages.map((pkg, i) => <Pressable key={pkg.identifier} accessibilityRole="radio"
              accessibilityState={{ checked: i === packageIndex }} onPress={() => setPackageIndex(i)}
              style={[styles.planCard, i === packageIndex && styles.planCardSelected]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.groupTitle}>{pkg.packageType === 'ANNUAL' ? 'Yearly' : 'Monthly'}</Text>
                <Text style={styles.smallText}>{pkg.packageType === 'ANNUAL' ? 'Billed annually' : 'Billed monthly'}</Text>
              </View>
              <Text style={styles.planPrice}>{pkg.product.priceString}</Text>
              <Text style={{ fontSize: 19, color: C.green, marginLeft: 8 }}>{i === packageIndex ? '◉' : '○'}</Text>
            </Pressable>)}
            {!packageBusy && !packages.length ? <Text style={styles.note}>No plans are available yet. Check your App Store subscription configuration.</Text> : null}
          </> : <>
            {['Yearly', 'Monthly'].map(label => <View key={label} style={[styles.planCard, { opacity: 0.65 }]}>
              <View style={{ flex: 1 }}><Text style={styles.groupTitle}>{label}</Text><Text style={styles.smallText}>Available when subscriptions are enabled</Text></View>
              <Text style={styles.smallText}>Not active</Text>
            </View>)}
            <View style={[styles.planCard, styles.planCardSelected]}><View style={{ flex: 1 }}><Text style={styles.groupTitle}>Free preview</Text><Text style={styles.smallText}>No charge and no subscription during testing</Text></View><Text style={styles.planPrice}>Free</Text></View>
          </>}
          <View style={styles.benefitsBox}>
            <Text style={[styles.groupTitle, { marginBottom: 9 }]}>Your stories include</Text>
            {['Moments and photo stories', 'Memories in your own words', 'People and shared stories', 'Control over privacy and sharing'].map(t =>
              <Text key={t} style={styles.benefitRow}><Text style={{ color: C.green }}>✓   </Text>{t}</Text>)}
          </View>
          {PAYMENTS_ENABLED ? <Text style={styles.note}>Any trial and renewal terms are determined by the App Store offer. Confirm the price and terms before paying.</Text> : null}
        </> : null}
      </ScrollView>}

      <View style={styles.footer}>
        {editor ? <>
          <Btn title={busy ? 'Saving…' : 'Save group'} busy={busy} onPress={saveEditor} />
          <Btn title="Cancel" kind="link" onPress={() => setEditor(null)} />
        </> : step === 0 ? <Btn title="Continue" busy={busy} onPress={saveProfile} /> :
          step === 1 ? <>
            <Btn title={busy ? 'Finding photos…' : 'Choose photos'} busy={busy} onPress={allowPhotos} />
            <Btn title="Not now" kind="link" onPress={() => setStep(3)} />
          </> : step === 2 ? <>
            <Btn title="Continue" onPress={() => setStep(3)} />
            <Btn title="Review later" kind="link" onPress={() => setStep(3)} />
          </> : PAYMENTS_ENABLED ? <>
            <Btn title={packages[packageIndex] ? 'Continue with ' + (packages[packageIndex].packageType === 'ANNUAL' ? 'Yearly' : 'Monthly') : 'Plans unavailable'}
              busy={busy} disabled={!packages.length || packageBusy} onPress={buyPlan} />
            <Btn title="Restore purchases" kind="link" busy={busy} onPress={restorePlan} />
          </> : <Btn title="Continue to Whole Stories" busy={busy} onPress={completeSetup} />}
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.cream },
  header: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0EBE1', alignItems: 'center', justifyContent: 'center' },
  brand: { fontFamily: F.serif, fontSize: 25, color: C.navy, flex: 1, marginLeft: 8 },
  progress: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 16, paddingBottom: 14, gap: 3 },
  progressStep: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  progressCircle: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  progressNumber: { color: C.white, fontFamily: F.sansBold, fontSize: 12 },
  progressLabel: { fontFamily: F.sansMedium, fontSize: 11 },
  content: { paddingHorizontal: 21, paddingTop: 8, paddingBottom: 24 },
  heading: { fontFamily: F.serif, color: C.navy, fontSize: 32, lineHeight: 37, marginBottom: 9 },
  paragraph: { fontFamily: F.sans, color: C.grey, fontSize: 14.5, lineHeight: 22, marginBottom: 14 },
  label: { fontFamily: F.sansBold, color: C.navy, fontSize: 14, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#DCD5CB', backgroundColor: C.card, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, fontFamily: F.sans, fontSize: 16, color: C.ink },
  avatar: { width: 110, height: 110, borderRadius: 55, backgroundColor: '#E2EBE0', alignItems: 'center', justifyContent: 'center' },
  cameraBadge: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.green, position: 'absolute', right: -4, bottom: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.cream },
  note: { textAlign: 'center', color: C.grey, fontFamily: F.sans, fontSize: 11.5, lineHeight: 17, marginTop: 8 },
  footer: { borderTopWidth: 1, borderColor: '#E6E1D8', paddingHorizontal: 22, paddingBottom: 4, paddingTop: 7, backgroundColor: C.cream },
  photoCards: { height: 220, flexDirection: 'row', marginVertical: 8, gap: 7, alignItems: 'center', justifyContent: 'center' },
  artCard: { flex: 1, height: 155, borderRadius: 17, borderColor: C.white, borderWidth: 4, alignItems: 'center', justifyContent: 'center', gap: 12 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 10 },
  benefitIcon: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', backgroundColor: C.greenSoft, color: C.green, fontSize: 25 },
  benefitTitle: { color: C.navy, fontFamily: F.serif, fontSize: 19, marginBottom: 3 },
  smallText: { fontFamily: F.sans, color: C.grey, fontSize: 12, lineHeight: 17 },
  groupCard: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, borderRadius: 17 },
  groupTitle: { fontFamily: F.serif, color: C.navy, fontSize: 19 },
  groupDate: { fontFamily: F.sans, color: C.grey, fontSize: 10.5 },
  groupThumb: { width: 56, height: 67, borderRadius: 9, backgroundColor: '#E4DAD0' },
  editHint: { color: C.green, fontFamily: F.sansMedium, fontSize: 11, marginTop: 2 },
  empty: { backgroundColor: C.card, padding: 22, borderRadius: 16, marginVertical: 12 },
  galleryHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'space-between' },
  selectionBadge: { position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  planArt: { height: 130, flexDirection: 'row', justifyContent: 'center', marginTop: 4, marginBottom: 10, gap: 12 },
  planPhoto: { width: '42%', height: 119, borderRadius: 16, borderWidth: 4, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  planCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderColor: C.line, borderWidth: 1.5, backgroundColor: C.card, padding: 15, marginVertical: 6 },
  planCardSelected: { borderColor: C.green, backgroundColor: C.greenSoft },
  planPrice: { fontFamily: F.serif, color: C.green, fontSize: 21 },
  benefitsBox: { marginTop: 14, padding: 15, borderRadius: 16, backgroundColor: '#EEF0E8' },
  benefitRow: { fontFamily: F.sans, fontSize: 13.5, color: C.ink, marginVertical: 4 },
  error: { color: C.red, fontFamily: F.sans, fontSize: 13 },
});
