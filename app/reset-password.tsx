import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { Screen, H1, P, Field, Btn } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { recoveryParams } from '@/lib/auth-links';

export default function ResetPassword() {
  const url = Linking.useURL();
  const initialWebUrl = useRef(Platform.OS === 'web' ? window.location.href : null);
  const processed = useRef<{ url: string; promise: Promise<void> } | null>(null);
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    const incoming = initialWebUrl.current ?? url;
    if (!incoming) return;
    let active = true;
    if (processed.current?.url !== incoming) {
      const promise = (async () => {
        const params = recoveryParams(incoming);
        const result = params.kind === 'session'
          ? await supabase.auth.setSession(params)
          : params.kind === 'code'
            ? await supabase.auth.exchangeCodeForSession(params.code)
            : await supabase.auth.verifyOtp({ token_hash: params.token_hash, type: 'recovery' });
        if (result.error) throw result.error;
        if (!result.data.session) throw new Error('This recovery link is invalid. Please request a new one.');
        if (Platform.OS === 'web') window.history.replaceState(null, '', window.location.pathname);
      })();
      processed.current = { url: incoming, promise };
    }
    processed.current.promise.then(() => { if (active) setVerified(true); })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Could not verify this link. Request a new one.'); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [url]);

  const save = async () => {
    if (busy || !verified) return;
    if (password.length < 8) return setMessage('Use a password of at least 8 characters.');
    if (password !== confirmation) return setMessage('The passwords do not match.');
    setBusy(true); setMessage('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword(''); setConfirmation(''); setDone(true);
      await supabase.auth.signOut();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update your password.'); }
    finally { setBusy(false); }
  };

  return <Screen>
    <H1>{done ? 'Password updated' : 'Reset your password'}</H1>
    {checking ? <P>Checking your recovery link…</P> : null}
    {done ? <><P>You can now log in with your new password.</P><Btn title="Log in" onPress={() => router.replace('/sign-in')} /></> : verified ? <>
      <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      <Field label="Confirm new password" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoComplete="new-password" />
      <Btn title="Save new password" onPress={save} busy={busy} />
    </> : !checking ? <Btn title="Request a new reset link" onPress={() => router.replace('/sign-in')} /> : null}
    {message ? <P accessibilityRole="alert">{message}</P> : null}
  </Screen>;
}
