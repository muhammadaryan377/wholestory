import { useEffect, useState } from 'react';
import { Screen, H1, P, ToggleRow, Small } from '@/components/ui';
import { defaultPrefs, getPrefs, registerPush, scheduleLocal, setPrefs, type NotifyPrefs } from '@/lib/notify';
import { listStories, memoryFilter } from '@/lib/api';
import { Alert } from '@/lib/alert';

export default function NotificationSettings() {
  const [p, setP] = useState<NotifyPrefs>(defaultPrefs);
  useEffect(() => { getPrefs().then(setP); }, []);
  const change = async (next: NotifyPrefs) => {
    try {
      await setPrefs(next);
      await scheduleLocal((await listStories()).filter(await memoryFilter()), next);
      if (next.fromOthers !== p.fromOthers) await registerPush(next.fromOthers);
      setP(next);
    } catch (error) { Alert.alert('Could not update reminders', error instanceof Error ? error.message : 'Please try again.'); }
  };
  return (
    <Screen>
      <H1>Notifications</H1>
      <P muted style={{ marginBottom: 12 }}>Gentle reminders only. You can turn each one off.</P>
      <ToggleRow title="This day last year" sub="When a story has its anniversary, at 9am" value={p.memories} onChange={v => change({ ...p, memories: v })} />
      <ToggleRow title="What made today special?" sub="A short evening prompt at 8pm" value={p.dailyPrompt} onChange={v => change({ ...p, dailyPrompt: v })} />
      <ToggleRow title="When people add to your stories" sub="And when guests add to your event walls" value={p.fromOthers} onChange={v => change({ ...p, fromOthers: v })} />
      <Small>Stories you hide in Hard memories or keep in Private never send reminders.</Small>
    </Screen>
  );
}
