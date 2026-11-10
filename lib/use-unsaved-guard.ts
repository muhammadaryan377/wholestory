import { useNavigation, usePreventRemove } from 'expo-router';
import { Alert } from './alert';

/** Asks before leaving a form with unsaved work. Pass false while saving so the save can navigate away. */
export function useUnsavedGuard(dirty: boolean) {
  const navigation = useNavigation();
  usePreventRemove(dirty, ({ data }) => {
    Alert.alert('Discard this?', 'What you’ve added here hasn’t been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
}
