import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Alert } from '@/lib/alert';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { Screen, H1, P, Btn, Card, Small, Empty, Field, runAction } from '@/components/ui';
import { Photo } from '@/components/media';
import { listStories, type Story } from '@/lib/api';
import { C, F } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { setPrivateUnlocked, usePrivateUnlocked } from '@/lib/private-access';

const KEY = 'ws_private_passcode';
const Dots = ({ n }: { n: number }) => (
  <View style={{ flexDirection: 'row', gap: 14, justifyContent: 'center', marginVertical: 18 }}>
    {Array.from({ length: 6 }).map((_, i) => <View key={i} style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: C.green, backgroundColor: i < n ? C.green : 'transparent' }} />)}
  </View>
);
function Keypad({ onDigit, onBack, onClear }: { onDigit: (d: string) => void; onBack: () => void; onClear: () => void }) {
  const { width, height } = useWindowDimensions();
  // Keep a 3-column grid and large round keys on small and large iPhones.
  const size = Math.min(92, Math.max(62, (width - 84) / 3.35), Math.max(62, (height - 350) / 4.8));
  const gap = Math.min(22, Math.max(10, size * 0.18));
  const keys = [
    { n: '1', letters: '' }, { n: '2', letters: 'ABC' }, { n: '3', letters: 'DEF' },
    { n: '4', letters: 'GHI' }, { n: '5', letters: 'JKL' }, { n: '6', letters: 'MNO' },
    { n: '7', letters: 'PQRS' }, { n: '8', letters: 'TUV' }, { n: '9', letters: 'WXYZ' },
    { n: '*', letters: '' }, { n: '0', letters: '+' }, { n: '#', letters: '' },
  ];
  return (
    <View style={{ alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', width: size * 3 + gap * 2, columnGap: gap, rowGap: gap, marginTop: 8 }}>
      {keys.map(({ n, letters }) => (
        <Pressable key={n} accessibilityRole="button"
          accessibilityLabel={n === '*' ? 'Clear PIN' : n === '#' ? 'Delete last digit' : `Digit ${n}`}
          accessibilityHint={n === '*' ? 'Clear entered digits' : n === '#' ? 'Erase one digit' : undefined}
          onPress={() => runAction(() => n === '*' ? onClear() : n === '#' ? onBack() : onDigit(n))}
          style={({ pressed }) => ({
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: pressed ? '#D3D3D3' : '#E9E9E9',
            alignItems: 'center', justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}>
          <Text style={{ color: '#101010', fontFamily: F.sans, fontSize: size * 0.45, lineHeight: size * 0.53 }}>{n}</Text>
          {letters ? <Text style={{ color: '#262626', fontFamily: F.sansBold, fontSize: Math.max(10, size * 0.14), letterSpacing: 2, marginTop: -2 }}>{letters}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

export default function Private() {
  const { session } = useAuth();
  const key = `${KEY}_${session?.user.id ?? 'signed_out'}`;
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [entry, setEntry] = useState(''); const [first, setFirst] = useState('');
  const verifying = useRef(false);
  const open = usePrivateUnlocked(); const [stories, setStories] = useState<Story[]>([]);
  const [resetting, setResetting] = useState(false); const [password, setPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { SecureStore.getItemAsync(key).then(setSaved).catch(() => setError('Private albums are available in the iPhone app.')); }, [key]);
  useFocusEffect(useCallback(() => { if (open) listStories({ private: true }).then(setStories).catch(e => setError(e.message ?? 'Could not load private stories.')); }, [open]));
  const unlock = async () => {
    try { setPrivateUnlocked(true); setError(''); setStories(await listStories({ private: true })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load private stories.'); }
  };
  const faceId = async () => {
    if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) return Alert.alert('Biometrics unavailable', 'Use your passcode, or set up Face ID or fingerprint recognition in device settings.');
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Open your private albums', fallbackLabel: 'Use passcode' });
    if (r.success) unlock();
  };
  const digit = async (d: string) => {
    if (verifying.current || entry.length >= 6) return;
    const next = (entry + d).slice(0, 6); setEntry(next);
    if (next.length < 6) return;
    verifying.current = true;
    try {
    if (!saved) {
      if (!first) { setFirst(next); setEntry(''); return; }
      if (first !== next) { Alert.alert('Passcodes didn’t match', 'Please try again.'); setFirst(''); setEntry(''); return; }
      await SecureStore.setItemAsync(key, next); setSaved(next); setEntry(''); unlock(); return;
    }
    if (next === saved) { setEntry(''); await unlock(); } else { setEntry(''); Alert.alert('Wrong passcode', 'Please try again.'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save or verify your passcode.'); setEntry(''); }
    finally { verifying.current = false; }
  };
  const reset = async () => {
    if (!session?.user.email || !password || resetBusy) return;
    setResetBusy(true); setError('');
    try {
      const result = await supabase.auth.signInWithPassword({ email: session.user.email, password });
      if (result.error) throw result.error;
      await SecureStore.deleteItemAsync(key);
      setPrivateUnlocked(false); setSaved(null); setFirst(''); setEntry(''); setPassword(''); setResetting(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not reset passcode.'); }
    finally { setResetBusy(false); }
  };
  if (saved === undefined) return <Screen><P>{error || 'Loading private albums…'}</P></Screen>;
  if (!open) return (
    <Screen>
      <H1 style={{ textAlign: 'center', marginTop: 8 }}>{saved ? 'Private' : 'Set Privacy PIN'}</H1>
      <P muted style={{ textAlign: 'center' }}>{saved ? 'Enter your passcode' : first ? 'Enter the same passcode again' : 'Choose a 6-digit passcode for your private albums. It stays on this phone.'}</P>
      <Dots n={entry.length} />
      <Keypad onDigit={digit} onBack={() => setEntry(value => value.slice(0, -1))} onClear={() => setEntry('')} />
      {saved ? <Btn kind="link" title="Use Face ID" onPress={faceId} /> : null}
      {saved ? <Btn kind="link" title="Forgot your passcode?" onPress={() => Alert.alert('Reset passcode?', 'Your private stories stay safe. You will choose a new passcode after logging in again.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: () => setResetting(true) }])} /> : null}
      {resetting ? <>
        <Field label="Confirm your account password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
        <Btn title="Reset passcode" busy={resetBusy} onPress={reset} />
        <Btn title="Cancel" kind="link" onPress={() => { setResetting(false); setPassword(''); }} />
      </> : null}
      {error ? <P accessibilityRole="alert">{error}</P> : null}
    </Screen>
  );
  return (
    <Screen>
      <H1>Private</H1>
      {error ? <P accessibilityRole="alert">{error}</P> : null}
      <P muted style={{ marginBottom: 12 }}>Only you can see these. They never appear in memories, the map or reminders.</P>
      <Btn title="New private story" onPress={() => router.push({ pathname: '/story/new', params: { private: '1' } })} />
      {!stories.length ? <Empty title="No private stories yet" body="Make a new one here, or move a story in from its ⋯ menu." /> : null}
      {stories.map(s => (
        <Card key={s.id} onPress={() => router.push(`/story/${s.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {s.cover ? <Photo path={s.cover} size={64} /> : <View style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: '#E9E4D9' }} />}
          <View style={{ flex: 1 }}><Text style={{ fontFamily: F.serif, fontSize: 17, color: C.navy }}>{s.title}</Text><Small>{s.entryCount ?? 0} moments · 🔒 Private</Small></View>
        </Card>
      ))}
    </Screen>
  );
}
