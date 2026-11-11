import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import Constants from 'expo-constants';
import type { User } from '@supabase/supabase-js';
import { Alert } from '@/lib/alert';
import { router, useFocusEffect } from 'expo-router';
import { Screen, H1, H2, Btn, Small } from '@/components/ui';
import { Icon } from '@/components/icon';
import { SettingsGroup, SettingsRow } from '@/components/settings-rows';
import { supabase } from '@/lib/supabase';
import { deleteAccount, myName, saveName, savePushToken } from '@/lib/api';
import { clearLocalAccountData } from '@/lib/account-data';
import { exportMyData } from '@/lib/exporter';
import { PAYMENTS_ENABLED } from '@/lib/payments';
import { useAuth } from '@/lib/auth';
import { chooseLocalProfilePhoto, readLocalProfilePhoto, removeProfilePhoto } from '@/lib/profile-photo';
import { C, F } from '@/lib/theme';

const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://wholestory.app/privacy';
const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://wholestory.app/terms';
const SUPPORT = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'support@wholestory.app';
const SAVED_NOTICE_MS = 2000;
const VERSION = Constants.expoConfig?.version;
const SUBSCRIPTION = Platform.OS === 'android'
  ? { url: 'https://play.google.com/store/account/subscriptions', sub: 'Manage or cancel in Google Play' }
  : { url: 'https://apps.apple.com/account/subscriptions', sub: 'Manage or cancel in your App Store settings' };
const PRIVATE_LOCK = Platform.select({ ios: 'Locked with a passcode or Face ID', android: 'Locked with a passcode or fingerprint', default: 'Locked with a passcode' });

const openLink = async (url: string, fallback: string) => {
  try { await Linking.openURL(url); }
  catch { Alert.alert('Could not open this', fallback); }
};

export default function Settings() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const metadataName: string = session?.user.user_metadata?.name ?? '';
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarRevision, setAvatarRevision] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [name, setName] = useState(metadataName);
  const [savedName, setSavedName] = useState(metadataName);
  const [freshUser, setFreshUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const nameInput = useRef<ComponentRef<typeof TextInput>>(null);
  const editing = useRef(false);
  const account = freshUser ?? session?.user;
  const email = account?.email ?? '';
  const verified = !!account?.email_confirmed_at;

  const load = useCallback(async () => {
    if (userId) readLocalProfilePhoto(userId).then(setAvatar).catch(() => setAvatar(null));
    try {
      setLoadError(false);
      const [loadedName, user] = await Promise.all([myName(), supabase.auth.getUser()]);
      if (user.error) throw user.error;
      setSavedName(loadedName);
      // Coming back to this tab must not wipe a name someone is still typing.
      if (!editing.current) setName(loadedName);
      setFreshUser(user.data.user);
    } catch { setLoadError(true); }
  }, [userId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), SAVED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const chooseAvatar = async () => {
    if (!userId || photoBusy) return;
    setPhotoBusy(true);
    try { const uri = await chooseLocalProfilePhoto(userId); if (uri) { setAvatar(uri); setAvatarRevision(v => v + 1); } }
    catch (e) { Alert.alert('Could not change profile photo', e instanceof Error ? e.message : 'Try again.'); }
    finally { setPhotoBusy(false); }
  };
  const removeAvatar = () => {
    if (!userId || photoBusy) return;
    Alert.alert('Remove profile photo?', 'This removes the photo from your Whole Story profile.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        setPhotoBusy(true);
        try { await removeProfilePhoto(userId); setAvatar(null); }
        catch (e) { Alert.alert('Could not remove photo', e instanceof Error ? e.message : 'Try again.'); }
        finally { setPhotoBusy(false); }
      } },
    ]);
  };
  const photoOptions = () => {
    if (!avatar) { void chooseAvatar(); return; }
    Alert.alert('Profile photo', 'Saved privately to your Whole Story account.', [
      { text: 'Change photo', onPress: chooseAvatar },
      { text: 'Remove photo', style: 'destructive', onPress: removeAvatar },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };
  const save = async () => {
    const next = name.trim();
    setBusy(true);
    try { await saveName(next); editing.current = false; setName(next); setSavedName(next); setJustSaved(true); }
    finally { setBusy(false); }
  };
  const download = async () => {
    if (exporting) return;
    setExporting('Preparing…');
    try { await exportMyData(setExporting); }
    catch (e: any) { Alert.alert('Could not download', e.message ?? 'Please try again.'); }
    finally { setExporting(''); }
  };
  const logOut = () => Alert.alert('Log out of Whole Story?', 'Your stories stay safe in your account.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Log out', onPress: async () => {
      await savePushToken(null).catch(() => {});
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace('/');
    } },
  ]);
  const del = () => Alert.alert('Delete your account?', 'This deletes your account, stories, photos and recordings from Whole Story. Your originals stay on your phone. This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete everything', style: 'destructive', onPress: async () => {
      try {
        await deleteAccount();
        if (userId) await clearLocalAccountData(userId).catch(() => {});
        router.replace('/');
      } catch (e: any) { Alert.alert('Could not delete', e.message); }
    } },
  ]);

  return (
    <Screen style={{ paddingTop: 8, paddingBottom: 28 }}>
      <H1>Settings</H1>
      {loadError ? <View accessibilityRole="alert" style={styles.notice}>
        <Text style={styles.noticeText}>Couldn’t refresh your account. Check your connection.</Text>
        <Pressable accessibilityRole="button" onPress={() => { void load(); }} hitSlop={8}><Text style={styles.noticeAction}>Try again</Text></Pressable>
      </View> : null}
      <View style={styles.sectionHeading}>
        <View style={styles.sectionIcon}><Icon name="person" size={20} color={C.green} /></View>
        <H2 style={{ marginBottom: 0 }}>Account</H2>
      </View>
      <View style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityLabel={avatar ? 'Change or remove your profile photo' : 'Add your profile photo'} onPress={photoOptions} disabled={photoBusy} style={styles.avatarRing}>
          {avatar ? <Image key={avatarRevision} source={{ uri: avatar }} cachePolicy="none" contentFit="cover" style={styles.avatar} /> :
            <View style={[styles.avatar, styles.avatarEmpty]}><Text style={styles.avatarLetter}>{savedName[0]?.toUpperCase() ?? '+'}</Text></View>}
          <View style={styles.cameraBadge}><Icon name="camera" size={15} color={C.white} /></View>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.nameRow}>
            <Text style={styles.displayName} numberOfLines={2}>{savedName || 'Add your name'}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit profile" onPress={() => nameInput.current?.focus()} hitSlop={6} style={styles.editButton}>
              <Icon name="pencil" size={14} color={C.green} /><Text style={styles.editText}>Edit Profile</Text>
            </Pressable>
          </View>
          {email ? <Text style={styles.email} numberOfLines={1}>{email}</Text> : null}
          {email && verified ? <View style={styles.verified}><Icon name="check" size={14} color={C.green} /><Text style={styles.verifiedText}>Account verified</Text></View> : null}
        </View>
      </View>
      <Text style={styles.label}>Your name</Text>
      <View style={styles.nameField}>
        <Icon name="person" size={21} color={C.navy} />
        <TextInput ref={nameInput} accessibilityLabel="Your name" value={name} onChangeText={text => { editing.current = true; setName(text); setJustSaved(false); }} autoCapitalize="words" returnKeyType="done" placeholder="Your name" placeholderTextColor={C.faint} style={styles.nameInput} />
      </View>
      <Btn title={justSaved ? 'Saved ✓' : 'Save Changes'} onPress={save} busy={busy} disabled={!name.trim()} />
      {session?.user.is_anonymous ? <>
        <Small style={{ marginVertical: 8 }}>You&apos;re in preview guest mode. Sign in with Apple, Google, or email to use an existing account. Guest stories are not transferred.</Small>
        <Btn title="Sign in or create an account" kind="outline" onPress={() => router.push('/sign-in')} />
      </> : null}

      <SettingsGroup title="Preferences">
        {PAYMENTS_ENABLED ? <SettingsRow icon="card" title="Subscription & billing" sub={SUBSCRIPTION.sub} onPress={() => openLink(SUBSCRIPTION.url, 'Open your subscriptions in your phone’s app store.')} /> : null}
        <SettingsRow icon="bell" title="Notifications" sub="Event updates, memories and reminders" onPress={() => router.push('/notifications')} />
        <SettingsRow icon="shield" title="Privacy & permissions" sub="Private vault, hard memories and legal" onPress={() => router.push('/privacy-settings')} />
        <SettingsRow icon="calendar" title="Event settings" sub="Manage your event walls and QR access" onPress={() => router.navigate('/(tabs)/events')} />
        <SettingsRow icon="download" title={exporting || 'Data & storage'} sub="Manage your photos, stories and export" onPress={() => router.push('/data-storage')} />
        <SettingsRow icon="sliders" title="Appearance & language" sub="Theme, language and date format" onPress={() => router.push('/appearance')} />
      </SettingsGroup>

      <SettingsGroup title="Your stories">
        <SettingsRow icon="people" title="People" sub="Everyone in your stories" onPress={() => router.push('/people')} />
        <SettingsRow icon="heart" title="Favourites" sub="Photos, stories and voice notes" onPress={() => router.navigate('/favourites')} />
        <SettingsRow icon="lock" title="Private albums" sub={PRIVATE_LOCK} onPress={() => router.push('/private')} />
        <SettingsRow icon="download" title={exporting || 'Download your data'} sub="Stories, photos, recordings and event walls" onPress={download} disabled={!!exporting} />
      </SettingsGroup>

      <SettingsGroup title="Help & support">
        <SettingsRow icon="play" title="View introduction" sub="Replay the five photo-led welcome screens" onPress={() => router.push('/welcome')} />
        <SettingsRow icon="mail" title="Contact us or send feedback" sub={SUPPORT} onPress={() => openLink(`mailto:${SUPPORT}?subject=${encodeURIComponent('Whole Story feedback')}`, `No email app was found. You can write to us at ${SUPPORT}.`)} />
        <SettingsRow icon="shield" title="Privacy Policy" onPress={() => openLink(PRIVACY_URL, PRIVACY_URL)} />
        <SettingsRow icon="document" title="Terms of Use" onPress={() => openLink(TERMS_URL, TERMS_URL)} />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow icon="logout" title="Log out" onPress={logOut} />
        <SettingsRow icon="trash" title="Delete my account" danger onPress={del} />
      </SettingsGroup>
      <Small style={{ textAlign: 'center', marginTop: 14 }}>Whole Story{VERSION ? ` · Version ${VERSION}` : ''}</Small>
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.redSoft, borderRadius: 12, padding: 12, marginBottom: 10 },
  noticeText: { flex: 1, fontFamily: F.sans, fontSize: 13, color: C.ink },
  noticeAction: { fontFamily: F.sansBold, fontSize: 13, color: C.green },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sectionIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#E2EDD9', alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, paddingHorizontal: 12, paddingVertical: 14, borderRadius: 16, marginBottom: 14 },
  avatarRing: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: '#BFD6B2', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarEmpty: { backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontFamily: F.serif, color: C.green, fontSize: 29 },
  cameraBadge: { position: 'absolute', right: -5, bottom: -3, width: 30, height: 30, borderRadius: 15, backgroundColor: C.green, borderWidth: 2, borderColor: C.card, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  displayName: { flex: 1, minWidth: 0, fontFamily: F.serif, fontSize: 19, color: C.navy },
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: C.green, borderRadius: 15, paddingHorizontal: 9, paddingVertical: 5 },
  editText: { fontFamily: F.sansMedium, fontSize: 11.5, color: C.green },
  email: { fontFamily: F.sans, fontSize: 13, color: C.grey, marginTop: 2 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: '#E2EDD9', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  verifiedText: { fontFamily: F.sansMedium, fontSize: 12, color: C.green },
  label: { fontFamily: F.sansBold, fontSize: 13, color: C.ink, marginBottom: 6 },
  nameField: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14, borderRadius: 24, borderWidth: 1, borderColor: '#E0D9CD', backgroundColor: C.card, marginBottom: 4 },
  nameInput: { flex: 1, minWidth: 0, fontFamily: F.sans, fontSize: 15, color: C.ink, paddingVertical: 10 },
});
