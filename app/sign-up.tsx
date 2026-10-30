import { useState } from 'react';
import { router } from 'expo-router';
import { Screen, H1, P, Btn, Field, Small } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { saveName } from '@/lib/api';

export default function SignUp() {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const go = async () => {
    if (busy) return;
    setMessage('');
    if (!name.trim() || !email.trim() || pw.length < 8) {
      setMessage('Add your name, email and a password of at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw, options: { data: { name: name.trim() } } });
      if (error) throw error;
      if (!data.session) {
        setMessage('Check your email for a confirmation link, then log in. If you already have an account, log in instead.');
        return;
      }
      await saveName(name.trim());
      router.replace('/onboarding');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create your account. Please try again.');
    } finally { setBusy(false); }
  };
  return (
    <Screen>
      <H1>Create your account</H1>
      <P muted style={{ marginBottom: 16 }}>A few details to get your story started.</P>
      <Field label="Your first name" value={name} onChangeText={setName} placeholder="e.g. Sam" autoComplete="given-name" />
      <Field label="Email address" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Create a password" value={pw} onChangeText={setPw} placeholder="At least 8 characters" secureTextEntry autoComplete="new-password" />
      <Small style={{ marginBottom: 10 }}>Your memories are private unless you choose to share them. By continuing you agree to the Terms and Privacy Policy.</Small>
      <Btn title="Create account" onPress={go} busy={busy} />
      {message ? <P accessibilityRole="alert">{message}</P> : null}
      <Btn title="Already have an account? Log in" kind="link" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}
