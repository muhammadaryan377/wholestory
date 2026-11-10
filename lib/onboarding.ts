import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export const ONBOARDING_STEPS = ['profile', 'photos', 'moments', 'plan'] as const;
export type OnboardingState = { done: boolean; step: number };
export type ProfileSetup = { interests: string[]; morning_memory: boolean; avatar_path: string | null };

export const setupKey = (userId: string) => `ws_onboarded_${userId}`;
const syncedKey = (userId: string) => `ws_onboarded_synced_${userId}`;
const FINISHED: OnboardingState = { done: true, step: ONBOARDING_STEPS.length - 1 };

/** PostgREST and Postgres codes for a table, column or function that has not been migrated yet. */
export const isMissingSchema = (error: { code?: string } | null | undefined) =>
  ['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42703', '42883'].includes(error?.code ?? '');

async function publishFinished(userId: string) {
  const { error } = await supabase.from('user_onboarding').upsert(
    { user_id: userId, current_step: ONBOARDING_STEPS[FINISHED.step], completed_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
  await AsyncStorage.setItem(syncedKey(userId), '1');
}

/** The account's record decides. Local storage is only a cache of a finished account. */
export async function readOnboardingState(userId: string): Promise<OnboardingState> {
  if ((await AsyncStorage.getItem(setupKey(userId))) === '1') {
    // Finishing works offline, so a record that never reached the server is sent again here.
    if ((await AsyncStorage.getItem(syncedKey(userId))) !== '1') publishFinished(userId).catch(() => {});
    return FINISHED;
  }

  const { data, error } = await supabase.from('user_onboarding').select('current_step,completed_at').eq('user_id', userId).maybeSingle();
  if (!error && data?.completed_at) {
    await AsyncStorage.multiSet([[setupKey(userId), '1'], [syncedKey(userId), '1']]);
    return FINISHED;
  }

  // Accounts finished by an app version that only wrote the auth metadata.
  const { data: auth } = await supabase.auth.getSession();
  if (auth.session?.user.id === userId && auth.session.user.user_metadata?.setup_complete === true) {
    await AsyncStorage.setItem(setupKey(userId), '1');
    publishFinished(userId).catch(() => {});
    return FINISHED;
  }

  if (error) {
    if (!isMissingSchema(error)) throw error;
    // Before the migration runs, this older device-wide flag is the only record some accounts have.
    if ((await AsyncStorage.getItem('ws_onboarded')) === '1') return FINISHED;
    return { done: false, step: 0 };
  }

  const step = ONBOARDING_STEPS.indexOf(data?.current_step as (typeof ONBOARDING_STEPS)[number]);
  return { done: false, step: Math.max(0, step) };
}

/** Best effort: moving between steps must still work offline. */
export async function saveOnboardingStep(userId: string, step: number) {
  try {
    await supabase.from('user_onboarding').upsert({ user_id: userId, current_step: ONBOARDING_STEPS[step] }, { onConflict: 'user_id' });
  } catch { /* the next step change sends the current position again */ }
}

export async function markSetupComplete(userId: string) {
  await AsyncStorage.setItem(setupKey(userId), '1');
  // Finishing must still work offline. readOnboardingState retries the server write. The auth
  // metadata keeps app versions that predate user_onboarding from repeating setup.
  await Promise.allSettled([publishFinished(userId), supabase.auth.updateUser({ data: { setup_complete: true } })]);
}

/** The signed-in person's own setup choices, which co-members cannot read. */
export async function readProfileSetup(): Promise<ProfileSetup | null> {
  const { data, error } = await supabase.rpc('my_profile_setup');
  if (error) throw error;
  return data as ProfileSetup | null;
}
