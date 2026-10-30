import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Newsreader_400Regular, Newsreader_600SemiBold, Newsreader_400Regular_Italic } from '@expo-google-fonts/newsreader';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { AuthProvider, useAuth } from '@/lib/auth';
import { configurePayments } from '@/lib/payments';
import { getPrefs, registerPush } from '@/lib/notify';
import { C, F } from '@/lib/theme';
import { setPrivateUnlocked } from '@/lib/private-access';
import { clearMediaCache } from '@/lib/media';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN && !__DEV__,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  maxBreadcrumbs: 0,
  beforeSend(event) {
    delete event.user; delete event.request; delete event.extra; delete event.breadcrumbs;
    return event;
  },
});

export { ErrorBoundary } from 'expo-router';
SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const [loaded, error] = useFonts({ Newsreader_400Regular, Newsreader_600SemiBold, Newsreader_400Regular_Italic, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  useEffect(() => { if (error) throw error; }, [error]);
  useEffect(() => { if (loaded) SplashScreen.hideAsync(); }, [loaded]);
  if (!loaded) return null;
  return (
    <AuthProvider>
      <SessionEffects />
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: C.cream }, headerShadowVisible: false, headerTintColor: C.ink, headerTitleStyle: { fontFamily: F.serif, color: C.navy }, contentStyle: { backgroundColor: C.cream }, headerBackTitle: 'Back' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ title: 'Log in' }} />
        <Stack.Screen name="sign-up" options={{ title: 'Create your account' }} />
        <Stack.Screen name="story/new" options={{ title: 'New story', presentation: 'modal' }} />
        <Stack.Screen name="story/[id]" options={{ title: '' }} />
        <Stack.Screen name="story/add/[id]" options={{ title: 'Add to this story', presentation: 'modal' }} />
        <Stack.Screen name="event/new" options={{ title: 'Create an event wall', presentation: 'modal' }} />
        <Stack.Screen name="event/[id]" options={{ title: '' }} />
        <Stack.Screen name="join/[code]" options={{ title: 'Join a story' }} />
        <Stack.Screen name="hard-memories" options={{ title: 'Hard memories' }} />
        <Stack.Screen name="setup" options={{ headerShown: false }} />
        <Stack.Screen name="private" options={{ title: 'Private' }} />
        <Stack.Screen name="story/tell" options={{ title: 'Tell the whole story', presentation: 'modal' }} />
        <Stack.Screen name="photo" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="favourites" options={{ title: 'Favourites' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="event/schedule/[id]" options={{ title: 'Schedule' }} />
        <Stack.Screen name="people/index" options={{ title: 'People' }} />
        <Stack.Screen name="people/[id]" options={{ title: '' }} />
        <Stack.Screen name="map" options={{ headerShown: false }} />
        <Stack.Screen name="suggestions" options={{ title: 'Suggested stories' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="paywall" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
    </AuthProvider>
  );
}

export default Sentry.wrap(RootLayout);

/** Things that start once someone is signed in: subscriptions, notifications and tapping a notification. */
function SessionEffects() {
  const { session } = useAuth();
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') { setPrivateUnlocked(false); clearMediaCache(); }
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!session) return;
    configurePayments(session.user.id);
    getPrefs().then(p => registerPush(p.fromOthers));
  }, [session]);
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(r => {
      const url = (r.notification.request.content.data as any)?.url;
      if (typeof url === 'string') router.push(url as any);
    });
    return () => sub.remove();
  }, []);
  return null;
}
