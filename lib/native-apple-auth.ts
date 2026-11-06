// Metro resolves native-apple-auth.ios.ts on iPhone. Other platforms keep
// using the existing Supabase OAuth + PKCE browser flow.
export async function signInWithNativeApple(): Promise<boolean> {
  throw new Error('Native Apple sign in is supported only on iOS.');
}
