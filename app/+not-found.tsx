import { Stack, router } from 'expo-router';
import { Screen, Empty } from '@/components/ui';
export default function NotFound() {
  return (<><Stack.Screen options={{ title: 'Not found' }} /><Screen><Empty title="This page doesn’t exist" body="It may have moved, or the link may be out of date." action="Go to Today" onAction={() => router.replace('/')} /></Screen></>);
}
