import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/lib/auth';
import { isConfigured, supabase } from '@/lib/supabase';
import { Loading } from '@/components/ui';
import { isSetupComplete } from '@/lib/moment-groups';
import { pendingInvite } from '@/lib/pending-invite';

const AUTO_GUEST = process.env.EXPO_PUBLIC_TEST_AUTO_GUEST === 'true';
const INTRO_SEEN_KEY = 'ws_intro_seen_v1';

export default function Index() {
  const { session, ready } = useAuth();
  const [guestAttempted, setGuestAttempted] = useState(false);
  const [introSeen, setIntroSeen] = useState<boolean | null>(null);
  const [setupState, setSetupState] = useState<{ userId: string; done: boolean } | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(INTRO_SEEN_KEY)
      .then(value => { if (mounted) setIntroSeen(value === '1'); })
      .catch(() => { if (mounted) setIntroSeen(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let active = true;
    pendingInvite().then(value => { if (active) setPendingCode(value); })
      .catch(() => { if (active) setPendingCode(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || session?.user.is_anonymous) return;
    let active = true;
    isSetupComplete(userId).then(done => {
      if (active) setSetupState({ userId, done });
    }).catch(() => { if (active) setSetupState({ userId, done: true }); });
    return () => { active = false; };
  }, [session?.user.id, session?.user.is_anonymous]);

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
  if (session) {
    if (session.user.is_anonymous) return <Redirect href="/(tabs)" />;
    if (!setupState || setupState.userId !== session.user.id) return <Loading />;
    if (!setupState.done) return <Redirect href="/onboarding" />;
    if (pendingCode === undefined) return <Loading />;
    if (pendingCode) return <Redirect href={{ pathname: '/join/[code]', params: { code: pendingCode } }} />;
    return <Redirect href="/(tabs)" />;
  }
  if (AUTO_GUEST && !guestAttempted) return <Loading />;
  if (introSeen === null) return <Loading />;
  return <Redirect href={introSeen ? '/sign-in' : '/welcome'} />;
}
