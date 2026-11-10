import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SocialButton } from './social-button';
import { GoogleLogo } from './brand-logos';
import { AppleSignInButton } from './apple-sign-in-button';
import { signInWithSocialProvider, type SocialProvider } from '@/lib/social-auth';
import { C, F } from '@/lib/theme';

export function AuthDivider({ label }: { label: string }) {
  return (
    <View style={styles.divider}>
      <View style={styles.line} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

export function SocialAuthButtons({ onError }: { onError: (message: string) => void }) {
  const [working, setWorking] = useState<SocialProvider | null>(null);

  const login = async (provider: SocialProvider) => {
    if (working) return;
    onError('');
    setWorking(provider);
    try {
      const complete = await signInWithSocialProvider(provider);
      if (complete) router.replace('/');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    } finally {
      setWorking(null);
    }
  };

  return (
    <>
      <AppleSignInButton onPress={() => void login('apple')} busy={working === 'apple'} disabled={!!working} />
      <SocialButton title="Continue with Google" logo={<GoogleLogo size={20} />} onPress={() => void login('google')} busy={working === 'google'} disabled={!!working} />
    </>
  );
}

const styles = StyleSheet.create({
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#D8D2C6' },
  label: { fontFamily: F.sans, fontSize: 13, color: C.grey },
});
