# WholeStory: Google and Apple sign-in setup

Branch: `secinf`. This implementation uses **Supabase OAuth with PKCE** for Google and Apple, and the existing `expo-web-browser` library on iOS/Android. It does **not** add provider secrets to the mobile bundle. Apple uses the browser OAuth method, not the native Apple Authentication sheet.

## Required setup before these buttons will work

1. In Supabase Dashboard > Authentication > Providers, enable **Google** and **Apple**. Provider setup is **not** included in the code changes.
2. For Google, create a Google Cloud OAuth **Web application** client. In Google Cloud, add the Supabase callback URL to Authorized redirect URIs: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`. Put the Google client ID and client secret **only in Supabase Auth provider settings**. Complete consent screen configuration, including test-user authorization if the app is still in Testing.
3. For Apple browser OAuth, create an Apple Services ID and Sign in with Apple signing key in Apple Developer, and register the Supabase callback URL `https://YOUR_PROJECT.supabase.co/auth/v1/callback` as the Services ID Return URL. Supply the Apple configuration in the Supabase provider. You also need the App ID/bundle identifier `app.wholestory.ios` configured in Apple Developer as appropriate. Do not commit Apple `.p8` keys or generated client secrets.
4. In Supabase > Authentication > URL Configuration > Redirect URLs, allow **the exact redirect returned by `Linking.createURL('auth/callback')`** for your installed app (typically `wholestory://auth/callback` or the equivalent scheme form), and the HTTPS web callback `https://YOUR_WEB_HOST/auth/callback`. If necessary, use a restricted pattern such as `wholestory://**` to support Expo's native scheme variants. Supabase redirects only to allowlisted URLs.
5. Set the real `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the EAS environment. Use an actual installed EAS preview/development build for native redirect testing. Expo Go is not suitable for reliably testing app-specific OAuth deep links.
6. Verify Google and Apple in an installed test build: cancel, accept, return to app, verify a real `auth.getUser()` session, restart app and check persistence, sign out, sign in again. Check web OAuth separately if the web app is hosted. Test with separate accounts for identity isolation.
7. For Apple browser OAuth, **rotate the Apple client secret every 6 months**, as required by Apple. Native Sign in with Apple would avoid this, but requires adding/configuring `expo-apple-authentication`, the Apple entitlement and a new signed build.

## Preview anonymous sessions

`EXPO_PUBLIC_TEST_AUTO_GUEST=true` still creates a real Supabase anonymous guest session and takes a tester to Home. A **Sign in or create an account** link appears under Settings for guests. A Google/Apple sign-in establishes a different account; it does **not migrate** any anonymous stories or photos. For tests of new-user sign-in without auto-guest, use a development environment where `EXPO_PUBLIC_TEST_AUTO_GUEST=false` and rebuild.

## Security properties

- Authorization-code + PKCE flow, not implicit tokens in the redirect.
- Provider OAuth client secrets remain in Supabase; only the publishable/anon key belongs in the app.
- Existing `Stack.Protected` routes and Supabase RLS remain enforced.
- Signing in using Google or Apple creates a Supabase account and session; this is **not an account-linking/merging feature**.
- Keep Google and Apple consent/provider configuration and redirect allowlist restricted to your real domains and scheme.

References:
- https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- https://supabase.com/docs/guides/auth/social-sign-in/auth-apple
- https://docs.expo.dev/versions/latest/sdk/webbrowser/
- https://docs.expo.dev/guides/authentication/
