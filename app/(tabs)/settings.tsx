import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Screen, H1, H2, Field, Btn, NavRow, Small } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { deleteAccount, myName, saveName } from '@/lib/api';
import { exportMyData } from '@/lib/exporter';
import { PAYMENTS_ENABLED } from '@/lib/payments';

const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://wholestory.app/privacy';
const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://wholestory.app/terms';
const SUPPORT = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'support@wholestory.app';

export default function Settings() {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [exporting, setExporting] = useState('');
  useFocusEffect(useCallback(() => { myName().then(setName); supabase.auth.getUser().then(r => setEmail(r.data.user?.email ?? '')); }, []));
  const save = async () => { setBusy(true); try { await saveName(name.trim()); Alert.alert('Saved'); } finally { setBusy(false); } };
  const del = () => Alert.alert('Delete your account?', 'This deletes your account, stories, photos and recordings from Wholestory. Your originals stay on your phone. This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete everything', style: 'destructive', onPress: async () => { try { await deleteAccount(); router.replace('/welcome'); } catch (e: any) { Alert.alert('Could not delete', e.message); } } },
  ]);
  return (
    <Screen>
      <H1>Settings</H1>
      <H2>Account</H2>
      <Field label="Your name" value={name} onChangeText={setName} />
      <Small style={{ marginBottom: 8 }}>{email}</Small>
      <Btn title="Save" kind="outline" onPress={save} busy={busy} />
      <H2 style={{ marginTop: 14 }}>Your stories</H2>
      <NavRow title="Notifications" sub="Memories, an evening prompt, and when people add to your stories" onPress={() => router.push('/notifications')} />
      <NavRow title="People" sub="People Pages" onPress={() => router.push('/people')} />
      <NavRow title="Favourites" sub="Photos you’ve hearted" onPress={() => router.push('/favourites')} />
      <NavRow title="Private albums" sub="Locked with a passcode or Face ID" onPress={() => router.push('/private')} />
      <NavRow title={exporting || 'Download your data'} sub="All your stories, photos, recordings and event walls in one file" onPress={async () => { if (exporting) return; setExporting('Preparing…'); try { await exportMyData(setExporting); } catch (e: any) { Alert.alert('Could not download', e.message ?? ''); } finally { setExporting(''); } }} />
      {PAYMENTS_ENABLED ? <NavRow title="Subscription" sub="Manage or cancel in your App Store settings" onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')} /> : null}
      <H2 style={{ marginTop: 14 }}>Privacy</H2>
      <NavRow title="Hard memories" sub="Choose which stories come back in memories" onPress={() => router.push('/hard-memories')} />
      <NavRow title="Privacy Policy" onPress={() => Linking.openURL(PRIVACY_URL)} />
      <NavRow title="Terms of Use" onPress={() => Linking.openURL(TERMS_URL)} />
      <H2 style={{ marginTop: 14 }}>Help</H2>
      <NavRow title="Contact us or send feedback" sub={SUPPORT} onPress={() => Linking.openURL(`mailto:${SUPPORT}?subject=Wholestory%20test%20feedback`)} />
      <Btn title="Log out" kind="outline" onPress={async () => { await supabase.auth.signOut(); router.replace('/welcome'); }} style={{ marginTop: 18 }} />
      <NavRow title="Delete my account" danger onPress={del} />
      <Small style={{ textAlign: 'center', marginTop: 10 }}>Wholestory test version</Small>
    </Screen>
  );
}
