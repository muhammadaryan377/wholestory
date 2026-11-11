import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Newsreader_400Regular, Newsreader_600SemiBold, Newsreader_400Regular_Italic } from '@expo-google-fonts/newsreader';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { AuthProvider, useAuth } from '@/lib/auth';
import { configurePayments } from '@/lib/payments';
import { getPrefs, registerPush, scheduleLocal, defaultPrefs } from '@/lib/notify';
import { C, F } from '@/lib/theme';
import { setPrivateUnlocked } from '@/lib/private-access';
import { clearMediaCache } from '@/lib/media';
import { DialogHost } from '@/components/dialog-host';
import { Loading } from '@/components/ui';
import { ensureProfile } from '@/lib/api';

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
      <DialogHost />
      <StatusBar style="dark" />
      <AppStack />
    </AuthProvider>
  );
}

function AppStack() {
  const { session, ready } = useAuth();
  if (!ready) return <Loading />;
  return (
      <Stack screenOptions={{ headerStyle: { backgroundColor: C.cream }, headerShadowVisible: false, headerTintColor: C.ink, headerTitleStyle: { fontFamily: F.serif, color: C.navy }, contentStyle: { backgroundColor: C.cream }, headerBackTitle: 'Back' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ title: 'Log in' }} />
        <Stack.Screen name="sign-up" options={{ title: 'Create your account' }} />
        <Stack.Screen name="reset-password" options={{ title: 'Reset password' }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="auth/confirm" options={{ headerShown: false }} />
        <Stack.Screen name="check-email" options={{ title: 'Confirm your email' }} />
        <Stack.Screen name="join/[code]" options={{ title: 'Join a story' }} />
        <Stack.Screen name="setup" options={{ headerShown: false }} />
        {/* (tabs) shares the "/" URL with app/index.tsx, so a Stack.Protected guard here makes the
            redirect bounce between the two forever ("Maximum update depth exceeded"). The tab
            layout checks the session itself and redirects signed-out users to /sign-in. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Protected guard={!!session}>
        <Stack.Screen name="story/new" options={{ title: 'New story', presentation: 'modal' }} />
        <Stack.Screen name="story/[id]" options={{ title: '' }} />
        <Stack.Screen name="story/add/[id]" options={{ title: 'Add to this story', presentation: 'modal' }} />
        <Stack.Screen name="event/new" options={{ title: 'Create an event wall', presentation: 'modal' }} />
        <Stack.Screen name="event/[id]" options={{ title: '' }} />
        <Stack.Screen name="hard-memories" options={{ title: 'Hard memories' }} />
        <Stack.Screen name="private" options={{ title: 'Private' }} />
        <Stack.Screen name="story/tell" options={{ title: 'Tell the whole story', presentation: 'modal' }} />
        <Stack.Screen name="photo" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="event/schedule/[id]" options={{ title: 'Schedule' }} />
        <Stack.Screen name="people/index" options={{ title: 'People' }} />
        <Stack.Screen name="people/[id]" options={{ title: '' }} />
        <Stack.Screen name="suggestions" options={{ title: 'Suggested stories' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="privacy-settings" options={{ title: 'Privacy & permissions' }} />
        <Stack.Screen name="data-storage" options={{ title: 'Data & storage' }} />
        <Stack.Screen name="appearance" options={{ title: 'Appearance & language' }} />
        <Stack.Screen name="paywall" options={{ headerShown: false, gestureEnabled: false }} />
        </Stack.Protected>
      </Stack>
  );
}

export default Sentry.wrap(RootLayout);

/** Things that start once someone is signed in: subscriptions, notifications and tapping a notification. */
function SessionEffects() {
  const { session, ready } = useAuth();
  const signedInUser = session?.user.id;
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background') { setPrivateUnlocked(false); clearMediaCache(); }
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!session) { scheduleLocal([], { ...defaultPrefs, memories: false, dailyPrompt: false }).catch(() => {}); return; }
    configurePayments(session.user.id).catch(() => {});
    ensureProfile().catch(() => {});
    getPrefs().then(p => registerPush(p.fromOthers)).catch(() => {});
  }, [session]);
  useEffect(() => {
    if (Platform.OS === 'web' || !ready || !signedInUser) return;
    const openNotification = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === 'string' && /^\/(story\/(?:new|[0-9a-f-]+)|event\/[0-9a-f-]+)(?:\?.*)?$/i.test(url)) router.push(url as any);
    };
    Notifications.getLastNotificationResponseAsync().then(response => {
      openNotification(response);
      if (response) Notifications.clearLastNotificationResponseAsync().catch(() => {});
    }).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(r => {
      openNotification(r);
    });
    return () => sub.remove();
  }, [ready, signedInUser]);
  return null;
}
