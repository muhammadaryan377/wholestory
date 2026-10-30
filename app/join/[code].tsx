import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen, H1, P, Btn, Loading } from '@/components/ui';
import { joinStory } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Join() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session, ready } = useAuth();
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!ready || !session) return;
    joinStory(code).then(id => router.replace(`/story/${id}`)).catch(e => setErr(e.message ?? 'This invite link is not valid'));
  }, [ready, session, code]);
  if (!ready) return <Loading />;
  if (!session) return <Screen><H1>Join a story</H1><P muted>Create an account or log in first, then open the invite link again.</P><Btn title="Create account" onPress={() => router.push('/sign-up')} /><Btn kind="link" title="Log in" onPress={() => router.push('/sign-in')} /></Screen>;
  return err ? <Screen><H1>Couldn’t join</H1><P muted>{err}</P></Screen> : <Loading />;
}
