import { Screen, H1, P } from '@/components/ui';
export default function Setup() {
  return (
    <Screen>
      <H1>Almost ready</H1>
      <P>This build has no server details yet. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see README, step 2), then build again.</P>
    </Screen>
  );
}
