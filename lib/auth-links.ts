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
