import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { Screen, H1, P, Btn, Loading } from '@/components/ui';
import { joinStory } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { validInviteCode, openInAppUrl, appStoreLinks } from '@/lib/invite-links';
import { completeInvite, type JoinFailure } from '@/lib/invite-flow';
import { rememberInvite, clearPendingInvite } from '@/lib/pending-invite';

export default function Join() {
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typeof params.code === 'string' && validInviteCode(params.code) ? params.code : null;
  const { session, ready } = useAuth();
  const userId = session?.user.is_anonymous ? null : session?.user.id;
  const [failure, setFailure] = useState<JoinFailure | null>(null);
  const [saveError, setSaveError] = useState('');
  const [retry, setRetry] = useState(0);
  const attempted = useRef('');

  useEffect(() => {
    if (!ready || !userId || !code) return;
    const key = userId + ':' + code + ':' + retry;
    if (attempted.current === key) return;
    attempted.current = key;
    let active = true;
    // The saved invitation is only removed when it worked or can never work; a dropped connection keeps it.
    completeInvite(code, joinStory, clearPendingInvite).then(result => {
      if (!active) return;
      if (result.ok) router.replace({ pathname: '/story/[id]', params: { id: result.storyId } });
      else setFailure(result);
    });
    return () => { active = false; };
  }, [ready, userId, code, retry]);

  const continueAuth = async (destination: '/sign-in' | '/sign-up') => {
    if (!code) return;
    try {
      await rememberInvite(code);
      router.push(destination);
    } catch {
      setSaveError('Could not save your invitation. Please try again.');
    }
  };

  if (!ready) return <Loading />;

  if (!code) return <Screen>
    <H1>Invalid invitation</H1>
    <P muted>This link is missing a valid invitation code. Ask the story owner to send a new link.</P>
    <Btn title="Back" onPress={() => router.replace('/')} />
  </Screen>;

  if (!session || session.user.is_anonymous) {
    const stores = Platform.OS === 'web' ? appStoreLinks() : { ios: null, android: null };
    return <Screen>
      <H1>You’ve been invited</H1>
      <P muted style={{ marginBottom: 15 }}>Log in or create an account to add your perspective to a shared Whole Story memory. Your invitation is kept while you sign in.</P>
      <Btn title="Log in to join" onPress={() => continueAuth('/sign-in')} />
      <Btn title="Create an account" kind="outline" onPress={() => continueAuth('/sign-up')} />
      {Platform.OS === 'web' ? <>
        <Btn title="Open in the Whole Story app" kind="link" onPress={() => Linking.openURL(openInAppUrl(code))} />
        {stores.ios ? <Btn title="Download on the App Store" kind="link" onPress={() => Linking.openURL(stores.ios as string)} /> : null}
        {stores.android ? <Btn title="Get it on Google Play" kind="link" onPress={() => Linking.openURL(stores.android as string)} /> : null}
        {!stores.ios && !stores.android
          ? <P muted style={{ marginTop: 8 }}>Don’t have the app yet? Install Whole Story, then open this invitation link again.</P> : null}
      </> : null}
      {saveError ? <P accessibilityRole="alert">{saveError}</P> : null}
    </Screen>;
  }

  if (failure) return <Screen>
    <H1>{failure.title}</H1>
    <P muted style={{ marginBottom: 15 }}>{failure.message}</P>
    {failure.retryable ? <Btn title="Try again" onPress={() => { setFailure(null); setRetry(i => i + 1); }} /> : null}
    <Btn title="Go to Home" kind={failure.retryable ? 'link' : 'primary'} onPress={() => router.replace('/')} />
  </Screen>;

  return <Loading />;
}
