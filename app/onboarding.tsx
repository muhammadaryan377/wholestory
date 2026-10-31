import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen, H1, P, Btn, Chip, ToggleRow, Small, Thread } from '@/components/ui';
import { saveProfileChoices } from '@/lib/api';
import { countPhotos, findSuggestions, libraryAllowed } from '@/lib/suggest';
import { getPrefs, setPrefs } from '@/lib/notify';
import { PAYMENTS_ENABLED } from '@/lib/payments';
import { C, F } from '@/lib/theme';
import { Alert } from '@/lib/alert';

const INTERESTS = ['Family', 'Travel', 'Friends', 'Couples', 'Events', 'Everyday life', 'Pets', 'Milestones'];
const Steps = ({ n }: { n: number }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 }}>
    {['About you', 'Photos', 'Plan'].map((t, i) => (
      <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: i < n ? C.green : i === n ? C.navy : '#D8D2C6', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 12, fontFamily: F.sansBold }}>{i < n ? '✓' : i + 1}</Text>
        </View>
        <Text style={{ fontFamily: F.sansMedium, fontSize: 13, color: i === n ? C.ink : C.grey }}>{t}</Text>
      </View>
    ))}
  </View>
);

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string[]>(['Family']); const [morning, setMorning] = useState(true);
  const [found, setFound] = useState<{ photos: number; moments: number } | null>(null); const [busy, setBusy] = useState(false);
  const finish = async (to?: string) => {
    await AsyncStorage.setItem('ws_onboarded', '1');
    if (PAYMENTS_ENABLED) return router.replace('/paywall');
    router.replace('/(tabs)'); if (to) setTimeout(() => router.push(to as any), 300);
  };
  const aboutYou = async () => {
    setBusy(true);
    try { await saveProfileChoices(picked, morning); const p = await getPrefs(); await setPrefs({ ...p, memories: morning }); setStep(1); }
    catch (error) { Alert.alert('Could not save your choices', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  };
  const allowPhotos = async () => {
    setBusy(true);
    try { if (await libraryAllowed(true)) { setFound({ photos: await countPhotos(), moments: (await findSuggestions(30)).length }); setStep(2); } else setStep(3); }
    catch (error) { Alert.alert('Could not read photos', error instanceof Error ? error.message : 'Please try again, or choose Not now.'); }
    finally { setBusy(false); }
  };
  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontFamily: F.serif, fontSize: 24, color: C.navy }}>Wholestory</Text><Thread width={110} />
      </View>
      <View style={{ height: 14 }} />
      <Steps n={step >= 2 ? (step === 3 ? 2 : 1) : step} />
      {step === 0 ? (<>
        <H1>Tell us about you</H1>
        <P muted style={{ marginBottom: 12 }}>A few details to personalise your Wholestory experience.</P>
        <Small style={{ marginBottom: 6 }}>What kind of moments do you want to remember?</Small>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{INTERESTS.map(t => <Chip key={t} label={t} on={picked.includes(t)} onPress={() => setPicked(picked.includes(t) ? picked.filter(x => x !== t) : [...picked, t])} />)}</View>
        <ToggleRow title="Morning memory" sub="A gentle “On this day” reminder when a story has its anniversary" value={morning} onChange={setMorning} />
        <Btn title="Continue" onPress={aboutYou} busy={busy} />
      </>) : null}
      {step === 1 ? (<>
        <H1>Add your photos</H1>
        <P muted style={{ marginBottom: 14 }}>Allow access and Wholestory will find trips, days out and moments worth telling. It all happens on your phone; nothing is uploaded unless you add it.</P>
        {busy ? <View style={{ alignItems: 'center', padding: 20 }}><ActivityIndicator color={C.green} /><Small style={{ marginTop: 8 }}>Looking through your photos…</Small></View> : null}
        <Btn title="Allow photo access" onPress={allowPhotos} busy={busy} />
        <Btn kind="link" title="Not now" onPress={() => setStep(3)} />
      </>) : null}
      {step === 2 && found ? (<>
        <H1>We found {found.photos.toLocaleString('en-GB')} photos</H1>
        <P muted style={{ marginBottom: 14 }}>{found.moments ? `Including ${found.moments} days and trips from the last two years worth telling.` : 'Start with a few of them and say what happened.'}</P>
        {found.moments ? <Btn title="See suggested stories" onPress={() => finish('/suggestions')} /> : null}
        <Btn title="Continue" kind={found.moments ? 'outline' : 'primary'} onPress={() => (PAYMENTS_ENABLED ? setStep(3) : finish())} />
      </>) : null}
      {step === 3 ? (<>
        <H1>You’re all set</H1>
        <P muted style={{ marginBottom: 14 }}>Your stories are private unless you choose to share them.</P>
        <Btn title={PAYMENTS_ENABLED ? 'Choose your plan' : 'Start'} onPress={() => finish()} />
      </>) : null}
    </Screen>
  );
}
