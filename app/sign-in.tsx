import { useState } from 'react';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Screen, H1, P, Btn, Field } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
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
        setMessage(error.message);
        return;
      }
      router.replace('/(tabs)');
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
  return (
    <Screen>
      <H1>Welcome back</H1>
      <P muted style={{ marginBottom: 16 }}>Log in to continue your stories.</P>
      <Field label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Password" value={pw} onChangeText={setPw} secureTextEntry autoComplete="current-password" />
      {message ? <P accessibilityRole="alert" style={{ marginBottom: 12 }}>{message}</P> : null}
      <Btn title="Log in" onPress={go} busy={busy} />
      <Btn kind="link" title="Forgot your password?" disabled={busy} onPress={reset} />
    </Screen>
  );
}
