import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Alert } from '@/lib/alert';
import { Screen, H1, P, ToggleRow } from '@/components/ui';
import { SettingsGroup, SettingsRow } from '@/components/settings-rows';
import { useAuth } from '@/lib/auth';

const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://wholestory.app/privacy';
const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://wholestory.app/terms';
const PRIVATE_LOCK = Platform.select({ ios: 'PIN, Face ID and secure storage', android: 'PIN, biometrics and secure storage', default: 'Passcode protection' });

export default function PrivacySettings() {
  const { session } = useAuth();
  const key = 'ws_private_by_default_' + (session?.user.id ?? 'anon');
  const [privateDefault, setPrivateDefault] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(key).then(v => { if (v === '0') setPrivateDefault(false); }).catch(() => {});
  }, [key]);

  const toggleDefault = (v: boolean) => {
    setPrivateDefault(v);
    void AsyncStorage.setItem(key, v ? '1' : '0').catch(() => {});
  };

  const openLink = async (url: string) => {
    try { await Linking.openURL(url); } catch { Alert.alert('Could not open link', url); }
  };

  return (
    <Screen>
      <H1>Privacy & permissions</H1>
      <P muted style={{ marginBottom: 14 }}>Your memories stay private unless you choose to share them.</P>
      <ToggleRow title="Private by default" sub="Only share memories when you explicitly invite others" value={privateDefault} onChange={toggleDefault} />
      <SettingsGroup>
        <SettingsRow icon="memories" title="Hard memories" sub="Choose which stories come back in memories" onPress={() => router.push('/hard-memories')} />
        <SettingsRow icon="lock" title="Private vault" sub={PRIVATE_LOCK} onPress={() => router.push('/private')} />
        <SettingsRow icon="shield" title="Privacy Policy" onPress={() => openLink(PRIVACY_URL)} />
        <SettingsRow icon="document" title="Terms of Use" onPress={() => openLink(TERMS_URL)} />
      </SettingsGroup>
    </Screen>
  );
}
