import { useState } from 'react';
import { router } from 'expo-router';
import { Screen, H1, P, Btn, Field } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { saveName } from '@/lib/api';
import { SocialAuthButtons } from '@/components/social-auth-buttons';
import { emailConfirmUrl } from '@/lib/email-confirmation';

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
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw, options: { data: { name: name.trim() }, emailRedirectTo: emailConfirmUrl() } });
      if (error) throw error;
      if (!data.session) {
        router.replace({ pathname: '/check-email', params: { email: email.trim(), sent: '1' } });
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
      {message ? <P accessibilityRole="alert" style={{ marginBottom: 12 }}>{message}</P> : null}
      <Btn title="Create account" onPress={go} busy={busy} />
      <SocialAuthButtons onError={setMessage} />
      <Btn title="Already have an account? Log in" kind="link" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}
