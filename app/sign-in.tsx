import { useCallback, useState } from 'react';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import { Screen, H1, P, Btn, Field } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { SocialAuthButtons } from '@/components/social-auth-buttons';
import { useAuth } from '@/lib/auth';
import { EmailConfirmation } from '@/components/email-confirmation';
import { BackButton } from '@/components/back-button';
import { backOrReplace, openHome } from '@/lib/navigation';
import { useHardwareBack } from '@/lib/use-hardware-back';

export default function SignIn() {
  const { session } = useAuth();
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const back = useCallback(() => {
    if (busy) return true;
    if (confirmationEmail) { setConfirmationEmail(null); setMessage(''); }
    else backOrReplace('/welcome');
    return true;
  }, [busy, confirmationEmail]);
  useHardwareBack(back);
  const header = <Stack.Screen options={{ headerLeft: () => <BackButton onPress={back} disabled={busy} />, gestureEnabled: !busy && !confirmationEmail }} />;
  const go = async () => {
    if (busy) return;
    setMessage('');
    if (!email.trim() || !pw) {
      setMessage('Enter your email address and password.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
      if (error) {
        if (error.code === 'email_not_confirmed') { setConfirmationEmail(email.trim()); return; }
        setMessage(error.message);
        return;
      }
      openHome();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not log in. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (busy) return;
    if (!email.trim()) return setMessage('Enter your email address first, then tap Forgot your password.');
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: Linking.createURL('/reset-password') });
      if (error) throw error;
      setMessage('If an account exists for this email, a reset link will arrive shortly. Open the latest link to choose a new password.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not send the reset email. Please try again.'); }
    finally { setBusy(false); }
  };
  if (confirmationEmail) return <>{header}<EmailConfirmation email={confirmationEmail} onContinue={() => setConfirmationEmail(null)} onBack={() => { setConfirmationEmail(null); setEmail(''); setPw(''); setMessage(''); }} /></>;
  return (
    <>{header}
    <Screen>
      <H1>Welcome back</H1>
      <P muted style={{ marginBottom: 16 }}>Log in to continue your stories.</P>
      <Field label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Password" value={pw} onChangeText={setPw} secureTextEntry autoComplete="current-password" />
      {message ? <P accessibilityRole="alert" style={{ marginBottom: 12 }}>{message}</P> : null}
      <Btn title="Log in" onPress={go} busy={busy} />
      <Btn kind="link" title="Forgot your password?" disabled={busy} onPress={reset} />
      {session?.user.is_anonymous ? <P muted style={{ marginTop: 12 }}>Signing in replaces this preview guest account. Guest stories are not transferred automatically.</P> : null}
      <SocialAuthButtons onError={setMessage} />
    </Screen></>
  );
}
