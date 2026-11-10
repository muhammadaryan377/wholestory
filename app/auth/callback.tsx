import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { Screen, H1, P, Btn } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/** Web OAuth redirect target. Native exchanges inside openAuthSessionAsync instead. */
export default function OAuthCallback() {
  const { session } = useAuth();
  const [errorText, setErrorText] = useState('');
  const attempted = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || attempted.current) return;
    attempted.current = true;
    const complete = async () => {
      const url = new URL(window.location.href);
      const errorDescription = url.searchParams.get('error_description') ?? url.searchParams.get('error');
      if (errorDescription) throw new Error(errorDescription);
      const code = url.searchParams.get('code');
      if (!code) throw new Error('Authorization code missing. Try signing in again.');
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      if (!data.session) throw new Error('Could not establish a login session.');
      window.history.replaceState(null, '', window.location.pathname);
      router.replace('/');
    };
    void complete().catch(error => setErrorText(error instanceof Error ? error.message : 'Sign-in failed.'));
  }, []);

  useEffect(() => {
    // On native, the auth browser's own caller exchanges the code. Avoid trying
    // to consume a single-use PKCE code a second time in this route.
    if (Platform.OS !== 'web' && session) router.replace('/');
  }, [session]);

  return (
    <Screen>
      <H1>{errorText ? 'Sign-in unsuccessful' : 'Completing sign-in…'}</H1>
      <P>{errorText || 'Finishing your secure Apple or Google sign-in.'}</P>
      {errorText ? <Btn title="Back to login" onPress={() => router.replace('/sign-in')} /> : null}
    </Screen>
  );
}
