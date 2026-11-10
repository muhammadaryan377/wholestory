import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

/** Google Maps stops the Android app when the build has no API key, so the map is only drawn with one. */
export const STORY_MAP_AVAILABLE = Platform.OS !== 'android' ||
  Constants.expoConfig?.extra?.androidMapsEnabled === true ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

