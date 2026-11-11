import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import * as ML from 'expo-media-library/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Alert } from '@/lib/alert';
import { fromAsset } from '@/components/media';
import { BrandHeader } from '@/components/story-chrome';
import { Icon } from '@/components/icon';
import { Btn, Small } from '@/components/ui';
import { handOff } from '@/lib/handoff';
import { libraryAllowed, toPicked } from '@/lib/suggest';
import { C, F, S } from '@/lib/theme';

const GRID_GAP = 6;
const QUICK_ACTIONS = [
  { key: 'tell', icon: 'book' as const, title: 'Tell the whole story', sub: 'Talk once & pin to photos', onPress: () => router.push('/story/tell') },
  { key: 'voice', icon: 'mic' as const, title: 'Quick voice story', sub: 'What made today special?', onPress: () => router.push({ pathname: '/story/new', params: { quick: '1' } }) },
  { key: 'event', icon: 'calendar' as const, title: 'Create event wall', sub: 'QR wall for guests', onPress: () => router.push('/event/new') },
];

export default function Add() {
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - S.pad * 2 - GRID_GAP * 2) / 3);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [recent, setRecent] = useState<ML.Asset[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadRecent = useCallback(async (ask = false) => {
    setLoading(true);
    try {
      const ok = await libraryAllowed(ask);
      setAllowed(ok);
      if (!ok) { setRecent([]); return; }
      const page = await ML.getAssetsAsync({ mediaType: 'photo', sortBy: [['creationTime', false]], first: showAll ? 60 : 12 });
      setRecent(page.assets);
    } catch {
      setAllowed(false);
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useFocusEffect(useCallback(() => { void loadRecent(false); }, [loadRecent]));

  const toggleAsset = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 30 ? prev : [...prev, id]);
  };

  const openPicker = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 30, quality: 0.85, exif: true });
      if (!r.canceled && r.assets.length) {
        handOff({ photos: r.assets.map(fromAsset) });
        router.push('/story/new');
      }
    } finally { setBusy(false); }
  };

  const openCamera = async () => {
    if (!Device.isDevice) {
      Alert.alert(
        'Camera Unavailable in Simulator',
        'The iOS Simulator does not have a camera. Would you like to select a photo from your photo library instead?',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Choose Photo', onPress: () => void openPicker() }],
      );
      return;
    }
    try {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) return Alert.alert('Camera not allowed', 'You can allow the camera for Whole Story in your phone Settings.');
      const r = await ImagePicker.launchCameraAsync({ quality: 0.85, exif: true });
      if (!r.canceled && r.assets.length) {
        handOff({ photos: r.assets.map(fromAsset) });
        router.push('/story/new');
      }
    } catch (err: any) {
      Alert.alert('Camera error', err?.message || 'Could not open camera.');
    }
  };

  const proceedWithSelected = async () => {
    if (busy || !selectedIds.length) return;
    setBusy(true);
    try {
      const byId = new Map(recent.map(a => [a.id, a]));
      const chosen = selectedIds.map(id => byId.get(id)).filter((a): a is ML.Asset => !!a);
      const picked = await toPicked(chosen, 30);
      if (!picked.length) return Alert.alert('Could not prepare photos', 'Try selecting from the photo library button above.');
      setSelectedIds([]);
      handOff({ photos: picked });
      router.push('/story/new');
    } catch (e: any) {
      Alert.alert('Could not open photos', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const selectedAssets = recent.filter(a => selectedIds.includes(a.id));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.cream }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: S.pad, paddingTop: 8, paddingBottom: selectedIds.length ? 120 : 28 }}>
        <BrandHeader />
        <Text style={styles.title}>Add photos</Text>
        <Text style={styles.subtitle}>Choose photos from your library or take new photos to add to a story.</Text>

        <View style={styles.actionGrid}>
          <Pressable accessibilityRole="button" accessibilityLabel="Photos: Choose from your library" onPress={openPicker} disabled={busy}
            style={({ pressed }) => [styles.actionCard, { backgroundColor: '#E4EFE6' }, pressed && { opacity: 0.85 }]}>
            <View style={[styles.actionBadge, { backgroundColor: C.green }]}>
              <Icon name="image" size={24} color="#FFF" />
            </View>
            <Text style={styles.actionTitle}>Photos</Text>
            <Text style={styles.actionSub}>Choose from your library</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Camera: Take new photos" onPress={openCamera} disabled={busy}
            style={({ pressed }) => [styles.actionCard, { backgroundColor: '#F9E6E4' }, pressed && { opacity: 0.85 }]}>
            <View style={[styles.actionBadge, { backgroundColor: '#D24A38' }]}>
              <Icon name="camera" size={24} color="#FFF" />
            </View>
            <Text style={styles.actionTitle}>Camera</Text>
            <Text style={styles.actionSub}>Take new photos</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent photos</Text>
          {allowed ? <Pressable onPress={() => setShowAll(v => !v)} hitSlop={8} style={styles.seeAll}>
            <Text style={styles.seeAllText}>{showAll ? 'Show fewer' : 'See all'}</Text>
            <Icon name="forward" size={16} color={C.green} />
          </Pressable> : null}
        </View>

        {loading && !recent.length ? <ActivityIndicator color={C.green} style={{ marginVertical: 20 }} /> : null}
        {allowed === false ? (
          <View style={styles.permissionBox}>
            <Small style={{ textAlign: 'center', marginBottom: 10 }}>Allow photo access to browse and select your recent photos right here, or tap Photos above.</Small>
            <Btn title="Show recent photos" kind="outline" onPress={() => void loadRecent(true)} />
          </View>
        ) : null}
        {allowed && recent.length > 0 ? (
          <View style={styles.grid}>
            {recent.map(asset => {
              const checked = selectedIds.includes(asset.id);
              return (
                <Pressable key={asset.id} accessibilityRole="checkbox" accessibilityState={{ checked }}
                  onPress={() => toggleAsset(asset.id)}
                  style={{ width: tile, height: tile, borderRadius: 12, overflow: 'hidden', backgroundColor: '#E8E0D5' }}>
                  <Image source={{ uri: asset.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  <View style={[styles.checkCircle, checked ? styles.checkOn : styles.checkOff]}>
                    {checked ? <Icon name="check" size={14} color="#FFF" /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <Text style={[styles.sectionTitle, { marginTop: 20, marginBottom: 10 }]}>More ways to add</Text>
        <View style={{ gap: 8 }}>
          {QUICK_ACTIONS.map(item => (
            <Pressable key={item.key} accessibilityRole="button" onPress={item.onPress}
              style={({ pressed }) => [styles.quickRow, pressed && { opacity: 0.8 }]}>
              <View style={styles.quickIcon}><Icon name={item.icon} size={20} color={C.green} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quickTitle}>{item.title}</Text>
                <Small>{item.sub}</Small>
              </View>
              <Icon name="forward" size={18} color={C.grey} />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {selectedIds.length > 0 ? (
        <View style={styles.tray}>
          <View style={{ flex: 1 }}>
            <Text style={styles.trayCount}>{selectedIds.length} {selectedIds.length === 1 ? 'photo' : 'photos'} selected</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 6 }}>
              {selectedAssets.map(a => (
                <Image key={a.id} source={{ uri: a.uri }} style={styles.trayThumb} contentFit="cover" />
              ))}
            </ScrollView>
          </View>
          <Btn title={busy ? 'Preparing…' : `Next (${selectedIds.length})`} onPress={proceedWithSelected} busy={busy} style={{ marginVertical: 0, paddingHorizontal: 18 }} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: F.serif, fontSize: 32, color: C.navy, textAlign: 'center', marginTop: 4 },
  subtitle: { fontFamily: F.sans, fontSize: 14, color: C.grey, textAlign: 'center', lineHeight: 20, marginTop: 6, marginBottom: 18, paddingHorizontal: 12 },
  actionGrid: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  actionCard: { flex: 1, borderRadius: 18, paddingVertical: 20, paddingHorizontal: 12, alignItems: 'center', borderWidth: 1, borderColor: C.line },
  actionBadge: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  actionTitle: { fontFamily: F.serif, fontSize: 19, color: C.navy },
  actionSub: { fontFamily: F.sans, fontSize: 12, color: C.grey, textAlign: 'center', marginTop: 3 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontFamily: F.serif, fontSize: 21, color: C.navy },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontFamily: F.sansMedium, fontSize: 13, color: C.green },
  permissionBox: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  checkCircle: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.green },
  checkOff: { backgroundColor: 'rgba(15,27,51,0.35)', borderWidth: 1.5, borderColor: '#FFF' },
  quickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12 },
  quickIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' },
  quickTitle: { fontFamily: F.sansBold, fontSize: 14.5, color: C.navy },
  tray: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.card, borderTopWidth: 1, borderColor: C.line, paddingHorizontal: S.pad, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  trayCount: { fontFamily: F.sansBold, fontSize: 13, color: C.navy },
  trayThumb: { width: 38, height: 38, borderRadius: 8 },
});
