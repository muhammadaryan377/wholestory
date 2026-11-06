import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, H1, P, Btn } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { openHome } from '@/lib/navigation';

export default function ConfirmEmail() {
  const { code, error_description: errorDescription } = useLocalSearchParams<{
    code?: string;
    error_description?: string;
  }>();
  const [message, setMessage] = useState('Confirmation link opened. Please log in to continue.');
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (errorDescription) {
      return;
    }
    if (!code) return;

    let active = true;
    void supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setMessage('Please log in to check your confirmed account.');
      } else {
        setSignedIn(!!data.session);
        setMessage('Your email has been confirmed successfully!');
      }
    }).catch(() => {
      if (active) setMessage('Please log in to continue.');
    });

    return () => { active = false; };
  }, [code, errorDescription]);

  return (
    <Screen>
      <H1>Email confirmation</H1>
      <P>{errorDescription || message}</P>
      <Btn
        title={signedIn ? 'Continue to Home' : 'Log in'}
        onPress={() => signedIn ? openHome() : router.replace('/sign-in')}
      />
    </Screen>
  );
}
