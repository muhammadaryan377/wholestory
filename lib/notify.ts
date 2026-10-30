import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { savePushToken, type Story } from './api';

export type NotifyPrefs = { memories: boolean; dailyPrompt: boolean; fromOthers: boolean };
const KEY = 'ws_notify_prefs';
export const defaultPrefs: NotifyPrefs = { memories: true, dailyPrompt: false, fromOthers: true };

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function getPrefs(): Promise<NotifyPrefs> {
  try { return { ...defaultPrefs, ...JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') }; } catch { return defaultPrefs; }
}
export async function setPrefs(p: NotifyPrefs) { await AsyncStorage.setItem(KEY, JSON.stringify(p)); }

export async function askPermission() {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const r = await Notifications.requestPermissionsAsync();
  return r.granted;
}

/** Registers this phone for notifications from other people (story additions, guest uploads). */
export async function registerPush(enabled: boolean) {
  try {
    if (!enabled) return savePushToken(null);
    if (!Device.isDevice || !(await askPermission())) return;
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId;
    if (!projectId) return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await savePushToken(token);
  } catch { /* push is optional */ }
}

/** Schedules gentle local reminders: story anniversaries and an evening prompt. */
export async function scheduleLocal(stories: Story[], prefs: NotifyPrefs) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!(prefs.memories || prefs.dailyPrompt)) return;
  if (!(await askPermission())) return;
  if (prefs.memories) {
    const now = new Date();
    const upcoming = stories
      .filter(s => !s.hidden_from_memories && !s.private)
      .map(s => {
        const d = new Date(s.story_date);
        const next = new Date(now.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0);
        if (next <= now) next.setFullYear(now.getFullYear() + 1);
        return { s, next, years: next.getFullYear() - d.getFullYear() };
      })
      .filter(x => x.years >= 1)
      .sort((a, b) => a.next.getTime() - b.next.getTime())
      .slice(0, 40);
    for (const { s, next, years } of upcoming) {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'This day last year', body: `${s.title}, ${years === 1 ? 'a year ago today' : `${years} years ago today`}`, data: { url: `/story/${s.id}` } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: next },
      });
    }
  }
  if (prefs.dailyPrompt) {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'What made today special?', body: 'Say it in a few seconds before the day slips away.', data: { url: '/story/new?quick=1' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 20, minute: 0 },
    });
  }
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'Wholestory', importance: AndroidImportance.DEFAULT });
}
