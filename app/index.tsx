import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { isConfigured, supabase } from '@/lib/supabase';
import { Loading } from '@/components/ui';

// Only internal preview builds may automatically create a Supabase guest session.
// This is real Supabase authentication, not a bypass of protected routes or RLS.
const AUTO_GUEST = process.env.EXPO_PUBLIC_TEST_AUTO_GUEST === 'true';

export default function Index() {
  const { session, ready } = useAuth();
  const [guestAttempted, setGuestAttempted] = useState(false);

  useEffect(() => {
    if (!AUTO_GUEST || !isConfigured || !ready || session || guestAttempted) return;
    let active = true;
    supabase.auth.signInAnonymously()
      .then(({ error }) => {
        if (error) console.warn('Guest sign-in unavailable:', error.message);
      })
      .catch((error) => console.warn('Guest sign-in failed:', error))
      .finally(() => { if (active) setGuestAttempted(true); });
    return () => { active = false; };
  }, [ready, session, guestAttempted]);

  if (!isConfigured) return <Redirect href="/setup" />;
  if (!ready) return <Loading />;
  if (session) return <Redirect href="/(tabs)" />;
  if (AUTO_GUEST && !guestAttempted) return <Loading />;
  // If anonymous auth is disabled or fails, keep the normal secure sign-in path.
  return <Redirect href="/welcome" />;
}
