import { router, Stack } from 'expo-router';
import { Empty, Screen } from '@/components/ui';

export default function StoriesMapWeb() {
  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: 'Story map' }} />
      <Empty
        title="Explore your stories"
        body="The story map is available in the iPhone and Android app. You can browse all your stories here in the browser."
        action="View stories"
        onAction={() => router.replace('/(tabs)/stories')}
      />
    </Screen>
  );
}
