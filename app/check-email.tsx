import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, P, Small, Btn, Field } from '@/components/ui';
import { AuthStatus } from '@/components/auth-status';
import { useAuth } from '@/lib/auth';
import { emailConfirmUrl } from '@/lib/email-confirmation';
import { supabase } from '@/lib/supabase';
import { F } from '@/lib/theme';

const RESEND_WAIT_SECONDS = 60;
const center = { textAlign: 'center' as const };

export default function CheckEmail() {
  const params = useLocalSearchParams<{ email?: string; sent?: string }>();
  const { session } = useAuth();
  const [email, setEmail] = useState(params.email ?? '');
  const [sent, setSent] = useState(params.sent === '1');
  const [wait, setWait] = useState(params.sent === '1' ? RESEND_WAIT_SECONDS : 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const address = email.trim();

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(left => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  // The link is usually opened in another tab or from the mail app, so the session arrives here on its own.
  const confirmed = !!session && !session.user.is_anonymous && !!session.user.email_confirmed_at
    && !!address && session.user.email?.toLowerCase() === address.toLowerCase();

  const send = async () => {
    if (busy || wait > 0 || !address) return;
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: address, options: { emailRedirectTo: emailConfirmUrl() } });
      if (error) throw error;
      setSent(true);
      setWait(RESEND_WAIT_SECONDS);
      setMessage('A new confirmation link is on its way.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send the email. Please try again.');
    } finally { setBusy(false); }
  };

  if (confirmed) return (
    <Screen>
      <AuthStatus icon="check" title="Email confirmed">
        <P style={center}>Your email address is confirmed and your account is ready.</P>
      </AuthStatus>
      <Btn title="Continue" onPress={() => router.replace('/')} />
    </Screen>
  );

  const sendLabel = wait > 0 ? `Resend email in ${wait}s` : sent ? 'Resend email' : 'Send confirmation email';
  return (
    <Screen>
      <AuthStatus icon="mail" title={sent ? 'Check your email' : 'Confirm your email'}>
        {sent
          ? <P style={center}>We sent a confirmation link to <P style={{ fontFamily: F.sansBold }}>{address}</P>. Open it to activate your account.</P>
          : <P style={center}>Your email address needs confirming before you can log in. We&apos;ll send you a link.</P>}
      </AuthStatus>
      {params.email ? null : <Field label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />}
      {message ? <P style={center}>{message}</P> : null}
      <Btn title="I've confirmed my email" onPress={() => router.replace({ pathname: '/sign-in', params: { email: address } })} />
      <Btn title={sendLabel} kind="outline" busy={busy} disabled={wait > 0 || !address} onPress={send} style={{ marginTop: 10 }} />
      <Small style={{ ...center, marginTop: 14 }}>Can&apos;t find it? Check your spam folder. If you already have an account, log in instead.</Small>
      <Btn title="Use a different email" kind="link" onPress={() => router.replace('/sign-up')} />
    </Screen>
  );
}
