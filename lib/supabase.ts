import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const isConfigured = url.length > 0 && anonKey.length > 0;
export const GUEST_PAGE_URL = process.env.EXPO_PUBLIC_GUEST_PAGE_URL ?? 'https://wholestory.app/e';

export const supabase = createClient(url || 'https://example.supabase.co', anonKey || 'missing-key', {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
