import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Screen, H1, P, ToggleRow, Small } from '@/components/ui';
import { defaultPrefs, getPrefs, notificationsBlocked, registerPush, scheduleLocal, setPrefs, type NotifyPrefs } from '@/lib/notify';
import { listStories, memoryFilter } from '@/lib/api';
import { Alert } from '@/lib/alert';
import { C, F } from '@/lib/theme';

export default function NotificationSettings() {
  const [p, setP] = useState<NotifyPrefs>(defaultPrefs);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    getPrefs().then(saved => { setP(saved); return notificationsBlocked(saved); }).then(setBlocked).catch(() => {});
  }, []);
  const change = async (next: NotifyPrefs) => {
    const previous = p;
    setP(next);
    try {
      await setPrefs(next);
      await scheduleLocal((await listStories()).filter(await memoryFilter()), next);
      if (next.fromOthers !== previous.fromOthers) await registerPush(next.fromOthers);
      setBlocked(await notificationsBlocked(next));
    } catch (error) {
      setP(previous);
      await setPrefs(previous).catch(() => {});
      Alert.alert('Could not update reminders', error instanceof Error ? error.message : 'Please try again.');
    }
  };
  return (
    <Screen>
      <H1>Notifications</H1>
      <P muted style={{ marginBottom: 12 }}>Gentle reminders only. You can turn each one off.</P>
      {blocked ? <View style={{ backgroundColor: C.redSoft, borderRadius: 14, padding: 14, marginBottom: 10 }}>
        <Text style={{ fontFamily: F.sansMedium, fontSize: 14, color: C.ink }}>Notifications are turned off for Whole Story on this phone, so these reminders can’t reach you.</Text>
        <Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings(); }} style={{ paddingTop: 8 }}><Text style={{ fontFamily: F.sansBold, fontSize: 14, color: C.green }}>Open phone settings</Text></Pressable>
      </View> : null}
      <ToggleRow title="This day last year" sub="When a story has its anniversary, at 9am" value={p.memories} onChange={v => change({ ...p, memories: v })} />
      <ToggleRow title="What made today special?" sub="A short evening prompt at 8pm" value={p.dailyPrompt} onChange={v => change({ ...p, dailyPrompt: v })} />
      <ToggleRow title="When people add to your stories" sub="And when guests add to your event walls" value={p.fromOthers} onChange={v => change({ ...p, fromOthers: v })} />
      <Small>Stories you hide in Hard memories or keep in Private never send reminders.</Small>
    </Screen>
  );
}
