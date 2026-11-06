import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { isConfigured, supabase } from './supabase';

// Supabase handles the provider's client secret server-side. Never place OAuth
// client secrets or the Supabase service-role key inside this app.
export type SocialProvider = 'google' | 'apple';

WebBrowser.maybeCompleteAuthSession();

/** Returns true after a native session is created; false on cancel/web redirect. */
export async function signInWithSocialProvider(provider: SocialProvider): Promise<boolean> {
  if (!isConfigured) throw new Error('Supabase is not configured for this build.');

  // Expo Router accepts this custom scheme on installed development / EAS builds.
  // The same exact address must be allowlisted in Supabase Auth > Redirect URLs.
  const redirectTo = Linking.createURL('auth/callback');
  const isWeb = Platform.OS === 'web';
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: !isWeb },
  });
  if (error) throw error;

  // On web, Supabase navigates away and app/auth/callback.tsx exchanges the code.
  if (isWeb) return false;
  if (!data.url) throw new Error('Could not start secure sign-in. Check your provider settings.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;

  const url = new URL(result.url);
  const errorDescription = url.searchParams.get('error_description') ?? url.searchParams.get('error');
  if (errorDescription) throw new Error(errorDescription);
  const code = url.searchParams.get('code');
  if (!code) throw new Error('No authorization code was returned. Please try again.');

  // PKCE prevents authorization-code interception; the verifier is stored by
  // Supabase Auth when signInWithOAuth starts.
  const exchange = await supabase.auth.exchangeCodeForSession(code);
  if (exchange.error) throw exchange.error;
  if (!exchange.data.session) throw new Error('Could not establish a login session.');
  return true;
}
