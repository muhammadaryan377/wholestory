import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/lib/auth';
import { isConfigured, supabase } from '@/lib/supabase';
import { Loading } from '@/components/ui';

const AUTO_GUEST = process.env.EXPO_PUBLIC_TEST_AUTO_GUEST === 'true';
const INTRO_SEEN_KEY = 'ws_intro_seen_v1';

export default function Index() {
  const { session, ready } = useAuth();
  const [guestAttempted, setGuestAttempted] = useState(false);
  const [introSeen, setIntroSeen] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(INTRO_SEEN_KEY)
      .then(value => { if (mounted) setIntroSeen(value === '1'); })
      .catch(() => { if (mounted) setIntroSeen(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!AUTO_GUEST || !isConfigured || !ready || session || guestAttempted) return;
    let active = true;
    supabase.auth.signInAnonymously()
      .then(({ error }) => { if (error) console.warn('Guest sign-in unavailable:', error.message); })
      .catch(error => console.warn('Guest sign-in failed:', error))
      .finally(() => { if (active) setGuestAttempted(true); });
    return () => { active = false; };
  }, [ready, session, guestAttempted]);

  if (!isConfigured) return <Redirect href="/setup" />;
  if (!ready) return <Loading />;
  if (session) return <Redirect href="/(tabs)" />;
  if (AUTO_GUEST && !guestAttempted) return <Loading />;
  if (introSeen === null) return <Loading />;
  return <Redirect href={introSeen ? '/sign-in' : '/welcome'} />;
}
