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
  // Copy first: a failed image conversion or disk write must not remove the old avatar.
  const staging = FileSystem.documentDirectory + 'ws-profile-' + userId + '-staging.jpg';
  await FileSystem.copyAsync({ from: choice.assets[0].uri, to: staging });
  try {
    if ((await FileSystem.getInfoAsync(destination)).exists) {
      // Keep the old avatar as a rollback until the new copy is in place.
      const backup = FileSystem.documentDirectory + 'ws-profile-' + userId + '-backup.jpg';
      if ((await FileSystem.getInfoAsync(backup)).exists) await FileSystem.deleteAsync(backup, { idempotent: true });
      await FileSystem.moveAsync({ from: destination, to: backup });
      try {
        await FileSystem.moveAsync({ from: staging, to: destination });
        await FileSystem.deleteAsync(backup, { idempotent: true });
      } catch (error) {
        await FileSystem.moveAsync({ from: backup, to: destination });
        throw error;
      }
    } else {
      await FileSystem.moveAsync({ from: staging, to: destination });
    }
    await AsyncStorage.setItem(avatarKey(userId), destination);
    return destination;
  } finally {
    if ((await FileSystem.getInfoAsync(staging)).exists) await FileSystem.deleteAsync(staging, { idempotent: true });
  }
}

/** Delete only the optional avatar from this device. Story photos are unaffected. */
export async function removeLocalProfilePhoto(userId: string) {
  const uri = await AsyncStorage.getItem(avatarKey(userId));
  if (uri && (await FileSystem.getInfoAsync(uri)).exists) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
  await AsyncStorage.removeItem(avatarKey(userId));
}
