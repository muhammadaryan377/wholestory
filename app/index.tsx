import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { isConfigured } from '@/lib/supabase';
import { Loading } from '@/components/ui';

export default function Index() {
  const { session, ready } = useAuth();
  if (!isConfigured) return <Redirect href="/setup" />;
  if (!ready) return <Loading />;
  return <Redirect href={session ? '/(tabs)' : '/welcome'} />;
}
