import { Link, Stack } from 'expo-router';
import { Screen, H1, P } from '@/components/ui';
export default function NotFound() {
  return (<><Stack.Screen options={{ title: 'Not found' }} /><Screen><H1>This page doesn’t exist</H1><Link href="/"><P>Go to Today</P></Link></Screen></>);
}
