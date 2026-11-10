import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { Screen, H1, P, Btn, Field } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { saveName } from '@/lib/api';
import { AuthDivider, SocialAuthButtons } from '@/components/social-auth-buttons';
import { emailConfirmUrl } from '@/lib/email-confirmation';
import { C, F } from '@/lib/theme';

const styles = StyleSheet.create({
  footer: { paddingVertical: 12, alignItems: 'center' },
  footerText: { fontFamily: F.sans, fontSize: 14, color: C.grey },
  footerLink: { fontFamily: F.sansMedium, color: C.green, textDecorationLine: 'underline' },
});

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
      // The account exists now, and onboarding asks for the name again if this write fails.
      await saveName(name.trim()).catch(() => {});
      router.replace('/onboarding');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create your account. Please try again.');
    } finally { setBusy(false); }
  };
  return (
    <Screen style={{ paddingTop: 36 }}>
      <H1>Create your account</H1>
      <P muted style={{ marginBottom: 16 }}>A few details to get your story started.</P>
      <SocialAuthButtons onError={setMessage} />
      <AuthDivider label="Or create with email" />
      <Field label="Your first name" value={name} onChangeText={setName} placeholder="e.g. Sam" autoComplete="given-name" />
      <Field label="Email address" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Create a password" value={pw} onChangeText={setPw} placeholder="At least 8 characters" secureTextEntry autoComplete="new-password" />
      {message ? <P accessibilityRole="alert" style={{ marginBottom: 12 }}>{message}</P> : null}
      <Btn title="Create account" onPress={go} busy={busy} />
      <Pressable accessibilityRole="button" accessibilityLabel="Already have an account? Log in" hitSlop={6} onPress={() => router.replace('/sign-in')} style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? <Text style={styles.footerLink}>Log in</Text></Text>
      </Pressable>
    </Screen>
  );
}
