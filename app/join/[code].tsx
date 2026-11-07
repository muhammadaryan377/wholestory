import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { Screen, H1, P, Btn, Loading } from '@/components/ui';
import { joinStory } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { validInviteCode, nativeInvitePath } from '@/lib/invite-links';
import { rememberInvite, clearPendingInvite } from '@/lib/pending-invite';

export default function Join() {
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typeof params.code === 'string' && validInviteCode(params.code) ? params.code : null;
  const { session, ready } = useAuth();
  const [err, setErr] = useState('');
  const [retry, setRetry] = useState(0);
  const attempted = useRef('');

  useEffect(() => {
    if (!ready || !session || !code) return;
    const key = session.user.id + ':' + code + ':' + retry;
    if (attempted.current === key) return;
    attempted.current = key;
    let active = true;
    joinStory(code)
      .then(async id => {
        if (!active) return;
        await clearPendingInvite(code).catch(() => {});
        router.replace({ pathname: '/story/[id]', params: { id } });
      })
      .catch(async reason => {
        if (!active) return;
        await clearPendingInvite(code).catch(() => {});
        if (active) setErr(reason instanceof Error ? reason.message : 'This invitation is invalid or no longer available.');
      });
    return () => { active = false; };
  }, [ready, session?.user.id, code, retry]);

  const continueAuth = async (destination: '/sign-in' | '/sign-up') => {
    if (!code) return;
    try {
      await rememberInvite(code);
      router.push(destination);
    } catch {
      setErr('Could not save your invitation. Please try again.');
    }
  };

  if (!ready) return <Loading />;
  if (!code) return <Screen><H1>Invalid invitation</H1><P muted>This link is missing a valid invitation code. Ask the story owner to send a new link.</P><Btn title="Back" onPress={() => router.replace('/')} /></Screen>;
  if (!session) return <Screen>
    <H1>You've been invited</H1>
    <P muted style={{ marginBottom: 15 }}>Sign in or create an account to add your perspective to a shared Whole Stories memory. Your invitation will be kept while you sign in.</P>
    <Btn title="Log in to join" onPress={() => continueAuth('/sign-in')} />
    <Btn title="Create an account" kind="outline" onPress={() => continueAuth('/sign-up')} />
    {Platform.OS === 'web' ? <Btn title="Open in Whole Stories app" kind="link"
      onPress={() => Linking.openURL('wholestory://' + nativeInvitePath(code))} /> : null}
    {err ? <P accessibilityRole="alert">{err}</P> : null}
  </Screen>;
  if (err) return <Screen><H1>Couldn't join this story</H1>
    <P muted style={{ marginBottom: 15 }}>{err}</P>
    <Btn title="Try again" onPress={() => { setErr(''); setRetry(i => i + 1); }} />
    <Btn title="Go to Home" kind="link" onPress={() => router.replace('/')} />
  </Screen>;
  return <Loading />;
}
