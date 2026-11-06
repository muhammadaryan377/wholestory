import { useState } from 'react';
import { router } from 'expo-router';
import { Btn, Small } from './ui';
import { AppleSignInButton } from './apple-sign-in-button';
import { signInWithSocialProvider, type SocialProvider } from '@/lib/social-auth';

export function SocialAuthButtons({ onError }: { onError: (message: string) => void }) {
  const [working, setWorking] = useState<SocialProvider | null>(null);

  const login = async (provider: SocialProvider) => {
    if (working) return;
    onError('');
    setWorking(provider);
    try {
      const complete = await signInWithSocialProvider(provider);
      if (complete) router.replace('/(tabs)');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    } finally {
      setWorking(null);
    }
  };

  return (
    <>
      <Small style={{ textAlign: 'center', marginTop: 18, marginBottom: 6 }}>
        Or continue securely with
      </Small>
      <AppleSignInButton onPress={() => void login('apple')} busy={working === 'apple'} disabled={!!working} />
      <Btn title="Continue with Google" kind="outline" onPress={() => void login('google')} busy={working === 'google'} disabled={!!working} />
    </>
  );
}
