import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { readOnboardingState } from './onboarding';

type Result = { userId: string; status: 'done' | 'needed' | 'error'; error: string };

/** Whether this account may enter the app. An unknown answer is an error, never a guess. */
export function useOnboardingGate(userId: string | undefined, anonymous: boolean | undefined) {
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    if (!userId || anonymous) return;
    let active = true;
    readOnboardingState(userId)
      .then(state => { if (active) setResult({ userId, status: state.done ? 'done' : 'needed', error: '' }); })
      .catch(error => { if (active) setResult({ userId, status: 'error', error: error?.message ?? 'Could not check your account.' }); });
    return () => { active = false; };
    // attempt re-runs the check after Try again.
  }, [userId, anonymous, attempt]));
  const retry = useCallback(() => { setResult(null); setAttempt(value => value + 1); }, []);
  if (!userId || anonymous) return { status: 'done' as const, error: '', retry };
  if (result?.userId !== userId) return { status: 'loading' as const, error: '', retry };
  return { status: result.status, error: result.error, retry };
}
