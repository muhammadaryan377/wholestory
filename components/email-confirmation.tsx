import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { BrandLogo, Btn, Card, H1, P, Screen, Small } from './ui';

export function EmailConfirmation({ email, onContinue, onBack }: { email: string; onContinue: () => void; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(60);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const timer = setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  const resend = async () => {
    if (busy || remaining > 0) return;
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: Linking.createURL('auth/confirm') },
      });
      if (error) throw error;
      setMessage('Confirmation email requested. Check your inbox and use the newest link.');
      setRemaining(60);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not resend the email. Please try again.');
    } finally { setBusy(false); }
  };
  return (
    <Screen style={{ gap: 16 }}>
      <BrandLogo />
      <H1>Confirm your email</H1>
      <P>Before you can log in, open the confirmation email for:</P>
      <P>{email}</P>
      <Card>
        <P>1. Open your email inbox on your phone.</P>
        <P style={{ marginTop: 12 }}>2. Find the confirmation email and tap its confirmation link.</P>
        <P style={{ marginTop: 12 }}>3. Return to Wholestory and log in with your email and password.</P>
      </Card>
      <Small>No email yet? Check Spam or Junk. Delivery can take a few minutes. If you already have an account, log in instead.</Small>
      {message ? <P accessibilityRole="alert">{message}</P> : null}
      <Btn title="I've confirmed my email — Log in" onPress={onContinue} disabled={busy} />
      <Btn title={remaining > 0 ? `Resend email in ${remaining}s` : 'Resend confirmation email'} kind="outline" onPress={() => void resend()} busy={busy} disabled={remaining > 0 || busy} />
      <Btn title="Use another email address" kind="link" onPress={onBack} disabled={busy} />
    </Screen>
  );
}
