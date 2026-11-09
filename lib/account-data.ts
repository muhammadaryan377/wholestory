import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { removeLocalProfilePhoto } from './profile-photo';

/** Everything this phone keeps for an account: photo, passcode, tags, favourites and preferences. */
export async function clearLocalAccountData(userId: string) {
  await removeLocalProfilePhoto(userId).catch(() => {});
  // SecureStore does not exist on web, where the passcode screen is not backed by it either.
  await SecureStore.deleteItemAsync(`ws_private_passcode_${userId}`).catch(() => {});
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key.endsWith(userId) || key === 'ws_place_names_v1');
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
