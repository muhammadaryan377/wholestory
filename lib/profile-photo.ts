import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

const avatarKey = (userId: string) => 'ws_profile_photo_' + userId;
// Browsers have no app Documents folder, so on web the avatar is kept as a small data URL in local browser storage.
const isDataUri = (uri: string) => uri.startsWith('data:');

/** Profile photo stays in this app's local Documents directory; not uploaded. */
export async function readLocalProfilePhoto(userId: string): Promise<string | null> {
  const uri = await AsyncStorage.getItem(avatarKey(userId));
  if (!uri) return null;
  if (isDataUri(uri)) return uri;
  return (await FileSystem.getInfoAsync(uri)).exists ? uri : null;
}

/** Web only: centre-crop to a square, shrink to 512px and keep it as a data URL (about 30-80 KB, never uploaded). */
async function saveWebProfilePhoto(userId: string, asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const side = Math.min(asset.width, asset.height);
  const actions: ImageManipulator.Action[] = [];
  if (side > 0) actions.push({ crop: { originX: Math.floor((asset.width - side) / 2), originY: Math.floor((asset.height - side) / 2), width: side, height: side } });
  actions.push({ resize: { width: 512 } });
  const result = await ImageManipulator.manipulateAsync(asset.uri, actions, { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  if (!result.base64) throw new Error('Could not read the selected photo. Please choose it again.');
  const dataUri = 'data:image/jpeg;base64,' + result.base64;
  await AsyncStorage.setItem(avatarKey(userId), dataUri);
  return dataUri;
}

export async function chooseLocalProfilePhoto(userId: string): Promise<string | null> {
  const choice = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
  });
  if (choice.canceled || !choice.assets[0]?.uri) return null;
  if (Platform.OS === 'web') return saveWebProfilePhoto(userId, choice.assets[0]);
  if (!FileSystem.documentDirectory) throw new Error('Local photo storage is unavailable.');
  const destination = FileSystem.documentDirectory + 'ws-profile-' + userId + '.jpg';
  // Copy first: a failed image conversion or disk write must not remove the old avatar.
  const staging = FileSystem.documentDirectory + 'ws-profile-' + userId + '-staging-' + Date.now() + '.jpg';
  await FileSystem.copyAsync({ from: choice.assets[0].uri, to: staging });
  try {
    if ((await FileSystem.getInfoAsync(destination)).exists) {
      // Keep the old avatar as a rollback until the new copy is in place.
      const backup = FileSystem.documentDirectory + 'ws-profile-' + userId + '-backup.jpg';
      if ((await FileSystem.getInfoAsync(backup)).exists) await FileSystem.deleteAsync(backup, { idempotent: true });
      await FileSystem.moveAsync({ from: destination, to: backup });
      try {
        await FileSystem.moveAsync({ from: staging, to: destination });
      } catch (error) {
        // Keep the existing picture if copying the replacement fails.
        await FileSystem.moveAsync({ from: backup, to: destination });
        throw error;
      }
      await FileSystem.deleteAsync(backup, { idempotent: true }).catch(() => {});
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
  if (uri && !isDataUri(uri) && (await FileSystem.getInfoAsync(uri)).exists) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
  await AsyncStorage.removeItem(avatarKey(userId));
}
