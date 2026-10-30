import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { hasAccess, PAYMENTS_ENABLED } from '@/lib/payments';
import { SymbolView } from 'expo-symbols';
import { useAuth } from '@/lib/auth';
import { C, F } from '@/lib/theme';
import { Loading } from '@/components/ui';

const icon = (ios: string, android: string) => {
  function TabIcon({ color }: { color: any }) {
    return <SymbolView name={{ ios: ios as any, android: android as any, web: android as any }} tintColor={color as string} size={24} />;
  }
  return TabIcon;
};

export default function TabLayout() {
  const { session, ready } = useAuth();
  const [paid, setPaid] = useState(true);
  useEffect(() => { if (PAYMENTS_ENABLED && session) hasAccess().then(setPaid); }, [session]);
  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/welcome" />;
  if (!paid) return <Redirect href="/paywall" />;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: C.green, tabBarInactiveTintColor: C.grey,
      tabBarStyle: { backgroundColor: C.cream, borderTopColor: C.line }, tabBarLabelStyle: { fontFamily: F.sansMedium, fontSize: 11 } }}>
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('sun.max', 'wb_sunny') }} />
      <Tabs.Screen name="stories" options={{ title: 'Stories', tabBarIcon: icon('photo.on.rectangle', 'photo_library') }} />
      <Tabs.Screen name="add" options={{ title: '', tabBarAccessibilityLabel: 'Add',
        tabBarButton: (props: any) => (
          <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel="Add photos or a story" style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ top: -16, width: 64, height: 64, borderRadius: 32, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: C.cream,
              shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 }}>
              <SymbolView name={{ ios: 'photo.badge.plus' as any, android: 'add_photo_alternate' as any, web: 'add_photo_alternate' as any }} tintColor="#FFFFFF" size={28} />
            </View>
          </Pressable>) }} />
      <Tabs.Screen name="events" options={{ title: 'Events Wall', tabBarIcon: icon('person.3', 'groups') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('gearshape', 'settings') }} />
    </Tabs>
  );
}
