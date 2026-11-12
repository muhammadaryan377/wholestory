import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { saveAvatarPath } from './api';
import { uploadFile } from './media';
import { isMissingSchema, readProfileSetup } from './onboarding';
import { supabase } from './supabase';

const avatarKey = (userId: string) => 'ws_profile_photo_' + userId;
const syncedKey = (userId: string) => 'ws_profile_photo_synced_' + userId;
const pendingKey = (userId: string) => 'ws_profile_photo_pending_' + userId;
const localDestination = (userId: string) => FileSystem.documentDirectory + 'ws-profile-' + userId + '.jpg';
// Browsers have no app Documents folder, so on web the avatar is kept as a small data URL in local browser storage.
const isDataUri = (uri: string) => uri.startsWith('data:');

async function existingLocalPhoto(userId: string): Promise<string | null> {
  const uri = await AsyncStorage.getItem(avatarKey(userId));
  if (!uri) return null;
  if (isDataUri(uri)) return uri;
  return (await FileSystem.getInfoAsync(uri)).exists ? uri : null;
}

async function uploadProfilePhoto(userId: string, uri: string) {
  const path = await uploadFile('avatars', userId, uri);
  try {
    await saveAvatarPath(path);
  } catch (error) {
    await supabase.storage.from('avatars').remove([path]).catch(() => {});
    throw error;
  }
  await AsyncStorage.setItem(syncedKey(userId), path);
  await AsyncStorage.removeItem(pendingKey(userId));
}

/** Retries a chosen photo that has not reached the account yet. Returns false if it still has not. */
export async function syncPendingProfilePhoto(userId: string): Promise<boolean> {
  if ((await AsyncStorage.getItem(pendingKey(userId))) !== '1') return true;
  const local = await existingLocalPhoto(userId);
  if (!local) { await AsyncStorage.removeItem(pendingKey(userId)); return true; }
  try { await uploadProfilePhoto(userId, local); return true; } catch { return false; }
}

async function downloadAccountPhoto(userId: string, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('avatars').createSignedUrl(path, 60 * 60);
  if (error || !data) return null;
  // Web has no Documents folder, and a short-lived link is enough to display the photo.
  if (Platform.OS === 'web') return data.signedUrl;
  if (!FileSystem.documentDirectory) return null;
  const { uri } = await FileSystem.downloadAsync(data.signedUrl, localDestination(userId));
  await AsyncStorage.multiSet([[avatarKey(userId), uri], [syncedKey(userId), path]]);
  return uri;
}

/** The photo for this account: this device's copy, refreshed from the account when another device changed it. */
export async function readLocalProfilePhoto(userId: string): Promise<string | null> {
  const local = await existingLocalPhoto(userId);
  if (!(await syncPendingProfilePhoto(userId))) return local;
  let remote: string | null;
  try { remote = (await readProfileSetup())?.avatar_path ?? null; } catch { return local; }
  const synced = await AsyncStorage.getItem(syncedKey(userId));
  if (!remote) {
    // No synced marker means a photo from before accounts stored them, which must stay on this device.
    if (synced) { await removeLocalProfilePhoto(userId); return null; }
    return local;
  }
  if (local && synced === remote) return local;
  return (await downloadAccountPhoto(userId, remote).catch(() => null)) ?? local;
}

/** Web only: centre-crop to a square, shrink to 512px and keep it as a data URL (about 30-80 KB). */
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

/** Keeps the chosen photo on this device, then saves it to the account. A failed upload is retried later. */
export async function chooseLocalProfilePhoto(userId: string, onUploading?: () => void): Promise<string | null> {
  const choice = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
  });
  if (choice.canceled || !choice.assets[0]?.uri) return null;
  onUploading?.();
  const local = Platform.OS === 'web' ? await saveWebProfilePhoto(userId, choice.assets[0]) : await saveNativeProfilePhoto(userId, choice.assets[0].uri);
  await AsyncStorage.setItem(pendingKey(userId), '1');
  await syncPendingProfilePhoto(userId);
  return local;
}

async function saveNativeProfilePhoto(userId: string, pickedUri: string): Promise<string> {
  if (!FileSystem.documentDirectory) throw new Error('Local photo storage is unavailable.');
  const destination = localDestination(userId);
  // Copy first: a failed image conversion or disk write must not remove the old avatar.
  const staging = FileSystem.documentDirectory + 'ws-profile-' + userId + '-staging-' + Date.now() + '.jpg';
  await FileSystem.copyAsync({ from: pickedUri, to: staging });
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
  await AsyncStorage.multiRemove([avatarKey(userId), syncedKey(userId), pendingKey(userId)]);
}

/** Removes the avatar from the account and this device. The database queues the stored file for deletion. */
export async function removeProfilePhoto(userId: string) {
  try {
    await saveAvatarPath(null);
  } catch (error) {
    if (!isMissingSchema(error as { code?: string })) throw error;
  }
  await removeLocalProfilePhoto(userId);
}
