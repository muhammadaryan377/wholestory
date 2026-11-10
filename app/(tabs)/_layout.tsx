import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, Tabs, useFocusEffect } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hasAccess, PAYMENTS_ENABLED } from '@/lib/payments';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/lib/auth';
import { C, F } from '@/lib/theme';
import { Loading, LoadError } from '@/components/ui';
import { Icon, type IconName } from '@/components/icon';
import { useOnboardingGate } from '@/lib/use-onboarding-gate';

const icon = (name: IconName) => {
  function TabIcon({ color }: { color: any }) {
    return <Icon name={name} color={color as string} size={26} />;
  }
  return TabIcon;
};

const label = (title: string) => {
  function TabLabel({ focused, color }: { focused: boolean; color: any }) {
    return (
      <View style={{ alignItems: 'center' }}>
        <Text style={{ color, fontFamily: focused ? F.sansBold : F.sansMedium, fontSize: 11 }}>{title}</Text>
        <View style={{ marginTop: 3, height: 3, width: 34, borderRadius: 2, backgroundColor: focused ? C.green : 'transparent' }} />
      </View>
    );
  }
  return TabLabel;
};

const NO_TAB_BUTTON = { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } };

function TabBackground() {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: C.cream }]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 400 80" preserveAspectRatio="none">
        <Path d="M0 62 C60 46 120 74 200 64 S330 28 400 50 V80 H0 Z" fill="#F4E6D6" opacity={0.75} />
      </Svg>
    </View>
  );
}

export default function TabLayout() {
  const { session, ready } = useAuth();
  const insets = useSafeAreaInsets();
  const userId = session?.user.id;
  const [access, setAccess] = useState<{ userId: string; paid: boolean; error: string } | null>(null);
  const accessRequest = useRef(0);
  const gate = useOnboardingGate(userId, session?.user.is_anonymous);
  const checkAccess = useCallback(async () => {
    if (!PAYMENTS_ENABLED || !userId) return;
    const request = ++accessRequest.current;
    try { const paid = await hasAccess(userId); if (request === accessRequest.current) setAccess({ userId, paid, error: '' }); }
    catch (error) { if (request === accessRequest.current) setAccess({ userId, paid: false, error: error instanceof Error ? error.message : 'Could not check your subscription.' }); }
  }, [userId]);
  useFocusEffect(useCallback(() => { void checkAccess(); return () => { accessRequest.current += 1; }; }, [checkAccess]));
  if (!ready) return <Loading />;
  // Not "/": that URL also belongs to this tab group's own index and would redirect back into it forever.
  if (!session) return <Redirect href="/sign-in" />;
  if (gate.status === 'loading') return <Loading />;
  if (gate.status === 'error') return <LoadError error={gate.error} onRetry={gate.retry} />;
  if (gate.status === 'needed') return <Redirect href="/onboarding" />;
  if (PAYMENTS_ENABLED && access?.userId !== userId) return <Loading />;
  if (PAYMENTS_ENABLED && access?.error) return <LoadError error={access.error} onRetry={checkAccess} />;
  if (PAYMENTS_ENABLED && !access?.paid) return <Redirect href="/paywall" />;
  return (
    <Tabs backBehavior="history" screenOptions={{ headerShown: false, tabBarActiveTintColor: C.green, tabBarInactiveTintColor: C.navy,
      tabBarBackground: TabBackground,
      tabBarStyle: { backgroundColor: 'transparent', borderTopColor: C.line, height: 64 + insets.bottom } }}>
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarLabel: label('Today'), tabBarIcon: icon('home') }} />
      <Tabs.Screen name="stories" options={{ title: 'Stories', tabBarLabel: label('Stories'), tabBarIcon: icon('book') }} />
      <Tabs.Screen name="add" options={{ title: '', tabBarAccessibilityLabel: 'Add',
        tabBarButton: (props: any) => (
          <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel="Add photos or a story" style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ top: -16, width: 64, height: 64, borderRadius: 32, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: C.cream,
              shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 }}>
              <SymbolView name={{ ios: 'photo.badge.plus' as any, android: 'add_photo_alternate' as any, web: 'add_photo_alternate' as any }} tintColor="#FFFFFF" size={28} />
            </View>
          </Pressable>) }} />
      <Tabs.Screen name="events" options={{ title: 'Events Wall', tabBarLabel: label('Events Wall'), tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarLabel: label('Settings'), tabBarIcon: icon('gear') }} />
      {/* Opened from Stories and Settings. They live here so the tab bar stays on screen, as in the design.
          Not href: null, which in SDK 58 makes the route redirect to the first tab. */}
      <Tabs.Screen name="map" options={NO_TAB_BUTTON} />
      <Tabs.Screen name="favourites" options={NO_TAB_BUTTON} />
    </Tabs>
  );
}
