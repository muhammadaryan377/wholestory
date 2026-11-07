import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

const avatarKey = (userId: string) => 'ws_profile_photo_' + userId;

/** Profile photo stays in this app's local Documents directory; not uploaded. */
export async function readLocalProfilePhoto(userId: string): Promise<string | null> {
  const uri = await AsyncStorage.getItem(avatarKey(userId));
  if (!uri) return null;
  return (await FileSystem.getInfoAsync(uri)).exists ? uri : null;
}

export async function chooseLocalProfilePhoto(userId: string): Promise<string | null> {
  const choice = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
  });
  if (choice.canceled || !choice.assets[0]?.uri) return null;
  if (!FileSystem.documentDirectory) throw new Error('Local photo storage is unavailable.');
  const destination = FileSystem.documentDirectory + 'ws-profile-' + userId + '.jpg';
  // Replacing the old file keeps the stored URI stable.
  if ((await FileSystem.getInfoAsync(destination)).exists) await FileSystem.deleteAsync(destination, { idempotent: true });
  await FileSystem.copyAsync({ from: choice.assets[0].uri, to: destination });
  await AsyncStorage.setItem(avatarKey(userId), destination);
  return destination;
}

/** Delete only the optional avatar from this device. Story photos are unaffected. */
export async function removeLocalProfilePhoto(userId: string) {
  const uri = await AsyncStorage.getItem(avatarKey(userId));
  if (uri && (await FileSystem.getInfoAsync(uri)).exists) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
  await AsyncStorage.removeItem(avatarKey(userId));
}
