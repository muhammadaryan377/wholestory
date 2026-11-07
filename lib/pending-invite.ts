import AsyncStorage from '@react-native-async-storage/async-storage';
import { validInviteCode } from './invite-links';

const KEY = 'ws_pending_story_invite_v1';
const MAX_AGE_MS = 14 * 86400 * 1000;

export async function rememberInvite(code: string) {
  if (!validInviteCode(code)) throw new Error('Invalid invitation code.');
  await AsyncStorage.setItem(KEY, JSON.stringify({ code, createdAt: Date.now() }));
}

export async function pendingInvite(): Promise<string | null> {
  let data: unknown;
  try { data = JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null'); }
  catch { return null; }
  if (!data || typeof data !== 'object') return null;
  const { code, createdAt } = data as { code?: unknown; createdAt?: unknown };
  if (!validInviteCode(code) || typeof createdAt !== 'number' ||
      createdAt > Date.now() || Date.now() - createdAt > MAX_AGE_MS) {
    await AsyncStorage.removeItem(KEY);
    return null;
  }
  return code;
}

export async function clearPendingInvite(code?: string) {
  if (code) {
    const existing = await pendingInvite();
    if (existing !== code) return;
  }
  await AsyncStorage.removeItem(KEY);
}
