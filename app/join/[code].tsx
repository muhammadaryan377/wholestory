import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { Image } from 'expo-image';
import { Screen, H1, P, Btn, Loading, Small } from '@/components/ui';
import { BrandHeader } from '@/components/story-chrome';
import { Icon } from '@/components/icon';
import { joinStory } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { validInviteCode, openInAppUrl, appStoreLinks } from '@/lib/invite-links';
import { completeInvite, type JoinFailure } from '@/lib/invite-flow';
import { rememberInvite, clearPendingInvite } from '@/lib/pending-invite';
import { C, F } from '@/lib/theme';

const PERMISSIONS = [
  { icon: 'book' as const, title: 'View', sub: 'See all photos and memories' },
  { icon: 'document' as const, title: 'Comment', sub: 'Leave a comment and react' },
  { icon: 'image' as const, title: 'Add photos', sub: 'Share your own photos and memories' },
];

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

  if (!code) return (
    <Screen>
      <BrandHeader />
      <H1>Invalid invitation</H1>
      <P muted>This link is missing a valid invitation code. Ask the story owner to send a new link.</P>
      <Btn title="Back" onPress={() => router.replace('/')} />
    </Screen>
  );

  if (!session || session.user.is_anonymous) {
    const stores = Platform.OS === 'web' ? appStoreLinks() : { ios: null, android: null };
    return (
      <Screen>
        <BrandHeader />
        <Image source={require('../../assets/onboarding/timeline_greece.jpg')} style={styles.hero} contentFit="cover" />
        <H1 style={{ textAlign: 'center', marginTop: 10 }}>You’ve been invited</H1>
        <P muted style={{ textAlign: 'center', marginBottom: 16 }}>
          Someone shared a Whole Story with you. Log in or create an account to view, comment and add your own photos.
        </P>

        <View style={styles.permRow}>
          {PERMISSIONS.map(item => (
            <View key={item.title} style={styles.permItem}>
              <View style={styles.permCircle}><Icon name={item.icon} size={20} color={C.green} /></View>
              <Text style={styles.permTitle}>{item.title}</Text>
              <Text style={styles.permSub}>{item.sub}</Text>
            </View>
          ))}
        </View>

        <View style={styles.privateBox}>
          <Icon name="lock" size={18} color={C.navy} />
          <View style={{ flex: 1 }}>
            <Text style={styles.privateTitle}>Private by default.</Text>
            <Small>Only invited people can access this story.</Small>
          </View>
        </View>

        <Btn title="Log in to join  ›" onPress={() => continueAuth('/sign-in')} />
        <Btn title="Create an account" kind="outline" onPress={() => continueAuth('/sign-up')} />
        <Btn title="Not now" kind="link" onPress={() => router.replace('/')} />
        {Platform.OS === 'web' ? <>
          <Btn title="Open in the Whole Story app" kind="link" onPress={() => Linking.openURL(openInAppUrl(code))} />
          {stores.ios ? <Btn title="Download on the App Store" kind="link" onPress={() => Linking.openURL(stores.ios as string)} /> : null}
          {stores.android ? <Btn title="Get it on Google Play" kind="link" onPress={() => Linking.openURL(stores.android as string)} /> : null}
          {!stores.ios && !stores.android
            ? <P muted style={{ marginTop: 8 }}>Don’t have the app yet? Install Whole Story, then open this invitation link again.</P> : null}
        </> : null}
        {saveError ? <P accessibilityRole="alert">{saveError}</P> : null}
      </Screen>
    );
  }

  if (failure) return (
    <Screen>
      <BrandHeader />
      <H1>{failure.title}</H1>
      <P muted style={{ marginBottom: 15 }}>{failure.message}</P>
      {failure.retryable ? <Btn title="Try again" onPress={() => { setFailure(null); setRetry(i => i + 1); }} /> : null}
      <Btn title="Go to Home" kind={failure.retryable ? 'link' : 'primary'} onPress={() => router.replace('/')} />
    </Screen>
  );

  return <Loading />;
}

const styles = StyleSheet.create({
  hero: { width: '100%', height: 185, borderRadius: 18, marginBottom: 6 },
  permRow: { flexDirection: 'row', gap: 10, marginVertical: 14 },
  permItem: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  permCircle: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  permTitle: { fontFamily: F.sansBold, fontSize: 13.5, color: C.navy },
  permSub: { fontFamily: F.sans, fontSize: 11, color: C.grey, textAlign: 'center', marginTop: 2, lineHeight: 15 },
  privateBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 14 },
  privateTitle: { fontFamily: F.sansBold, fontSize: 13.5, color: C.navy },
});
