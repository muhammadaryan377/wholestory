/** Parse Supabase recovery redirects without ever logging credentials. */
export function recoveryParams(url: string) {
  const parsed = new URL(url);
  const query = parsed.searchParams;
  const hash = new URLSearchParams(parsed.hash.slice(1));
  const value = (key: string) => hash.get(key) ?? query.get(key);
  const error = value('error_description') ?? value('error');
  if (error) throw new Error(error);
  const access_token = value('access_token');
  const refresh_token = value('refresh_token');
  if (access_token && refresh_token && value('type') === 'recovery') {
    return { kind: 'session' as const, access_token, refresh_token };
  }
  const code = value('code');
  if (code) return { kind: 'code' as const, code };
  const token_hash = value('token_hash');
  if (token_hash && value('type') === 'recovery') return { kind: 'otp' as const, token_hash };
  throw new Error('Open the latest password reset link from your email. If it has expired, request a new link.');
}

export type SignupLink =
  | { kind: 'session'; access_token: string; refresh_token: string }
  | { kind: 'code'; code: string }
  | { kind: 'otp'; token_hash: string; type: 'signup' | 'email' }
  | { kind: 'error'; message: string };

/**
 * Parse the redirect from a sign-up confirmation email. The first email carries a PKCE code;
 * emails sent through "Resend" carry session tokens in the hash instead.
 */
export function signupLinkParams(url: string): SignupLink {
  const parsed = new URL(url);
  const query = parsed.searchParams;
  const hash = new URLSearchParams(parsed.hash.slice(1));
  const value = (key: string) => hash.get(key) ?? query.get(key);
  const error = value('error_description') ?? value('error');
  if (error) return { kind: 'error', message: error };
  const type = value('type');
  const isSignup = type === 'signup' || type === 'email';
  const access_token = value('access_token');
  const refresh_token = value('refresh_token');
  if (access_token && refresh_token && isSignup) return { kind: 'session', access_token, refresh_token };
  const code = value('code');
  if (code) return { kind: 'code', code };
  const token_hash = value('token_hash');
  if (token_hash && isSignup) return { kind: 'otp', token_hash, type };
  return { kind: 'error', message: 'Open the latest confirmation link from your email.' };
}
