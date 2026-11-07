import { useCallback, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Alert } from '@/lib/alert';
import { router, useFocusEffect } from 'expo-router';
import { LoadError, Screen, H1, H2, Field, Btn, NavRow, Small } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { deleteAccount, myName, saveName, savePushToken } from '@/lib/api';
import { exportMyData } from '@/lib/exporter';
import { PAYMENTS_ENABLED } from '@/lib/payments';
import { useAuth } from '@/lib/auth';
import { chooseLocalProfilePhoto, readLocalProfilePhoto, removeLocalProfilePhoto } from '@/lib/profile-photo';
import { C, F } from '@/lib/theme';

const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://wholestory.app/privacy';
const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://wholestory.app/terms';
const SUPPORT = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'support@wholestory.app';

export default function Settings() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarRevision, setAvatarRevision] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [exporting, setExporting] = useState('');
  const [loadError, setLoadError] = useState('');
  const load = useCallback(async () => {
    try {
      setLoadError('');
      const [name, user] = await Promise.all([myName(), supabase.auth.getUser()]);
      if (user.error) throw user.error;
      setName(name); setEmail(user.data.user?.email ?? '');
      if (userId) setAvatar(await readLocalProfilePhoto(userId).catch(() => null));
    } catch (e) { setLoadError(e instanceof Error ? e.message : 'Could not load account details.'); }
  }, [userId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const chooseAvatar = async () => {
    if (!session?.user.id || photoBusy) return;
    setPhotoBusy(true);
    try { const uri = await chooseLocalProfilePhoto(session.user.id); if (uri) { setAvatar(uri); setAvatarRevision(v => v + 1); } }
    catch (e) { Alert.alert('Could not change profile photo', e instanceof Error ? e.message : 'Try again.'); }
    finally { setPhotoBusy(false); }
  };
  const removeAvatar = () => {
    if (!session?.user.id || photoBusy) return;
    Alert.alert('Remove profile photo?', 'This only removes the photo from your profile on this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        if (!session?.user.id) return;
        setPhotoBusy(true);
        try { await removeLocalProfilePhoto(session.user.id); setAvatar(null); }
        catch (e) { Alert.alert('Could not remove photo', e instanceof Error ? e.message : 'Try again.'); }
        finally { setPhotoBusy(false); }
      } },
    ]);
  };
  const save = async () => { setBusy(true); try { await saveName(name.trim()); Alert.alert('Saved'); } finally { setBusy(false); } };
  const del = () => Alert.alert('Delete your account?', 'This deletes your account, stories, photos and recordings from Wholestory. Your originals stay on your phone. This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete everything', style: 'destructive', onPress: async () => { try { await deleteAccount(); router.replace('/'); } catch (e: any) { Alert.alert('Could not delete', e.message); } } },
  ]);
  if (loadError) return <LoadError error={loadError} onRetry={load} />;
  return (
    <Screen>
      <H1>Settings</H1>
      <H2>Account</H2>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, padding: 13, borderRadius: 16, marginBottom: 15 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={avatar ? 'Change your profile photo' : 'Add your profile photo'} onPress={chooseAvatar}
          disabled={photoBusy} style={{ width: 68, height: 68, backgroundColor: C.greenSoft, borderRadius: 34, alignItems: 'center', justifyContent: 'center' }}>
          {avatar ? <Image key={avatarRevision} source={{ uri: avatar }} cachePolicy="none" contentFit="cover" style={{ width: 68, height: 68, borderRadius: 34 }} /> :
            <Text style={{ fontFamily: F.serif, color: C.green, fontSize: 29 }}>{name[0]?.toUpperCase() ?? '+'}</Text>}
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontFamily: F.serif, fontSize: 18, color: C.navy }}>Your profile photo</Text>
          <Pressable accessibilityRole="button" disabled={photoBusy} onPress={chooseAvatar}><Text style={{ fontFamily: F.sansMedium, color: C.green, fontSize: 13 }}>{avatar ? 'Change photo' : 'Add photo'}</Text></Pressable>
          {avatar ? <Pressable accessibilityRole="button" disabled={photoBusy} onPress={removeAvatar}><Text style={{ fontFamily: F.sansMedium, color: C.red, fontSize: 12 }}>Remove photo</Text></Pressable> : null}
          <Small>Stored on this device.</Small>
        </View>
      </View>
      <Field label="Your name" value={name} onChangeText={setName} />
      <Small style={{ marginBottom: 8 }}>{email}</Small>
      <Btn title="Save" kind="outline" onPress={save} busy={busy} />
      {session?.user.is_anonymous ? <>
        <Small style={{ marginBottom: 8 }}>You&apos;re in preview guest mode. Sign in with Apple, Google, or email to use an existing account. Guest stories are not transferred.</Small>
        <NavRow title="Sign in or create an account" sub="Apple, Google, or email" onPress={() => router.push('/sign-in')} />
      </> : null}
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
      <Btn title="Log out" kind="outline" onPress={async () => {
        await savePushToken(null).catch(() => {});
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        router.replace('/');
      }} style={{ marginTop: 18 }} />
      <NavRow title="Delete my account" danger onPress={del} />
      <Small style={{ textAlign: 'center', marginTop: 10 }}>Wholestory test version</Small>
    </Screen>
  );
}
