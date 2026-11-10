import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { Screen, P, Btn } from '@/components/ui';
import { AuthStatus } from '@/components/auth-status';
import { signupLinkParams } from '@/lib/auth-links';
import { supabase } from '@/lib/supabase';

type Confirmed = 'signed-in' | 'confirmed';
type Outcome = { state: 'checking' } | { state: Confirmed } | { state: 'failed'; message: string };

const center = { textAlign: 'center' as const };

async function confirmFrom(url: string): Promise<Confirmed> {
  const link = signupLinkParams(url);
  if (link.kind === 'error') throw new Error(link.message);
  if (link.kind === 'code') {
    // Supabase only issues this code after verifying the email. The exchange fails when the link
    // is opened on another browser or device, but the email is confirmed either way.
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(link.code);
      return !error && data.session ? 'signed-in' : 'confirmed';
    } catch {
      return 'confirmed';
    }
  }
  const result = link.kind === 'session'
    ? await supabase.auth.setSession(link)
    : await supabase.auth.verifyOtp({ token_hash: link.token_hash, type: link.type });
  if (result.error) throw result.error;
  return result.data.session ? 'signed-in' : 'confirmed';
}

/** Landing page for the link in the sign-up confirmation email. */
export default function ConfirmEmail() {
  const url = Linking.useURL();
  const initialWebUrl = useRef(Platform.OS === 'web' ? window.location.href : null);
  const processed = useRef<{ url: string; promise: Promise<Confirmed> } | null>(null);
  const [outcome, setOutcome] = useState<Outcome>({ state: 'checking' });

  useEffect(() => {
    const incoming = initialWebUrl.current ?? url;
    if (!incoming) return;
    let active = true;
    if (processed.current?.url !== incoming) {
      const promise = confirmFrom(incoming).finally(() => {
        if (Platform.OS === 'web') window.history.replaceState(null, '', window.location.pathname);
      });
      processed.current = { url: incoming, promise };
    }
    processed.current.promise
      .then(state => { if (active) setOutcome({ state }); })
      .catch(error => { if (active) setOutcome({ state: 'failed', message: error instanceof Error ? error.message : 'Could not confirm your email.' }); });
    return () => { active = false; };
  }, [url]);

  if (outcome.state === 'checking') return (
    <Screen><AuthStatus icon="busy" title="Confirming your email…" /></Screen>
  );

  if (outcome.state === 'failed') return (
    <Screen>
      <AuthStatus icon="alert" title="We couldn't confirm your email">
        <P style={center}>{outcome.message}</P>
        <P muted style={center}>Links expire and can only be used once. If you have already confirmed, just log in.</P>
      </AuthStatus>
      <Btn title="Log in" onPress={() => router.replace('/sign-in')} />
      <Btn title="Send a new link" kind="outline" onPress={() => router.replace('/check-email')} style={{ marginTop: 10 }} />
    </Screen>
  );

  const signedIn = outcome.state === 'signed-in';
  return (
    <Screen>
      <AuthStatus icon="check" title="Email confirmed">
        <P style={center}>{signedIn ? 'Your account is ready.' : 'Your account is ready. Log in to continue.'}</P>
      </AuthStatus>
      <Btn title={signedIn ? 'Continue' : 'Log in'} onPress={() => router.replace(signedIn ? '/' : '/sign-in')} />
    </Screen>
  );
}
