/** Public invite links must be real HTTPS URLs that any messaging app can share. */
const CODE_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;

export function validInviteCode(value: unknown): value is string {
  return typeof value === 'string' && CODE_PATTERN.test(value);
}

export function inviteWebOrigin(raw: string | undefined = process.env.EXPO_PUBLIC_INVITE_BASE_URL): string {
  if (!raw) throw new Error('Invitation links are not configured yet. Set EXPO_PUBLIC_INVITE_BASE_URL to the verified HTTPS website address.');
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error('The invitation website address is invalid.'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
      (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new Error('Invitation website must be a secure HTTPS domain without a path or query.');
  }
  return url.origin;
}

export function buildInviteUrl(code: string, baseUrl?: string): string {
  if (!validInviteCode(code)) throw new Error('The invitation code is invalid.');
  return inviteWebOrigin(baseUrl) + '/join/' + encodeURIComponent(code);
}

export function inviteMessage(title: string, url: string): string {
  const cleanTitle = title.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return [
    "You're invited to add your side of a story on Whole Stories!",
    '',
    cleanTitle ? '"' + cleanTitle + '"' : 'A shared story',
    '',
    'Add your photos and memories:',
    url,
  ].join('\n');
}

/** Custom-scheme links stay as an internal/testing fallback only, never shared publicly. */
export function nativeInvitePath(code: string): string {
  if (!validInviteCode(code)) throw new Error('The invitation code is invalid.');
  return '/join/' + code;
}
