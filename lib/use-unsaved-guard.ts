import { useCallback, useState } from 'react';
import { usePreventRemove } from 'expo-router';
import { Alert } from './alert';

/** Asks before leaving a form with unsaved work. Call the returned function right before navigating after a save. */
export function useUnsavedGuard(dirty: boolean) {
  const [bypassed, setBypassed] = useState(false);
  const active = dirty && !bypassed;

  const disablePrevention = usePreventRemove(active, ({ repeat }) => {
    Alert.alert('Discard this?', 'What you’ve added here hasn’t been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          setBypassed(true);
          repeat();
        },
      },
    ]);
  });

  return useCallback(() => {
    setBypassed(true);
    disablePrevention();
  }, [disablePrevention]);
}
