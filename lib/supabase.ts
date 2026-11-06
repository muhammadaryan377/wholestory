import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
export const isConfigured = /^https?:\/\/[^/]+$/.test(url) && !!anonKey && !/YOUR-/i.test(url + anonKey) && !anonKey.startsWith('sb_secret_');
export const GUEST_PAGE_URL = process.env.EXPO_PUBLIC_GUEST_PAGE_URL ?? 'https://wholestory.app/e';

export const supabase = createClient(isConfigured ? url : 'https://example.supabase.co', isConfigured ? anonKey : 'missing-key', {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' },
});
