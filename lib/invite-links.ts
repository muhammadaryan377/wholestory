/** Public invite links must be real HTTPS URLs that any messaging app can share. */
const CODE_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;

/** Same value as "scheme" in app.json. Used only for the "Open in the app" button on the web page. */
export const INVITE_APP_SCHEME = 'wholestory';

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
    "You're invited to add your side of a story on Whole Story!",
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

/** Address for the "Open in the Whole Story app" button shown on the web invitation page. */
export function openInAppUrl(code: string): string {
  if (!validInviteCode(code)) throw new Error('The invitation code is invalid.');
  return INVITE_APP_SCHEME + '://join/' + code;
}

function codeFromPath(path: string): string | null {
  const match = /^\/join\/([^/]+)\/?$/.exec(path);
  if (!match) return null;
  let code: string;
  try { code = decodeURIComponent(match[1]); }
  catch { return null; }
  return validInviteCode(code) ? code : null;
}

/**
 * Pulls the invitation code out of anything that can open the app: the shared HTTPS link (only on the
 * configured invitation website), the wholestory:// link, or the in-app /join/CODE route.
 * Returns null for anything else, so unknown hosts and malformed codes are never trusted.
 */
export function parseInviteLink(input: unknown, baseUrl: string | undefined = process.env.EXPO_PUBLIC_INVITE_BASE_URL): string | null {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (!text || text.length > 2048) return null;
  if (text.startsWith('/')) return codeFromPath(text.split(/[?#]/)[0]);
  let url: URL;
  try { url = new URL(text); }
  catch { return null; }
  if (url.protocol === 'https:') {
    let origin: string;
    try { origin = inviteWebOrigin(baseUrl); }
    catch { return null; }
    return url.origin === origin ? codeFromPath(url.pathname) : null;
  }
  if (url.protocol === INVITE_APP_SCHEME + ':') return codeFromPath('/' + url.host + url.pathname);
  return null;
}

function httpsOrNull(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

/** Public store pages shown on the web invitation page. Null until the real store URLs are configured. */
export function appStoreLinks(
  ios: string | undefined = process.env.EXPO_PUBLIC_IOS_APP_STORE_URL,
  android: string | undefined = process.env.EXPO_PUBLIC_ANDROID_PLAY_STORE_URL,
): { ios: string | null; android: string | null } {
  return { ios: httpsOrNull(ios), android: httpsOrNull(android) };
}
