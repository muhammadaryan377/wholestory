import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Alert } from '@/lib/alert';
import { Redirect, router } from 'expo-router';
import type { PurchasesPackage } from 'react-native-purchases';
import { Screen, H1, P, Btn, Small, Thread } from '@/components/ui';
import { buy, getPackages, restore, PAYMENTS_ENABLED } from '@/lib/payments';
import { C, F } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

export default function Paywall() {
  const [pkgs, setPkgs] = useState<PurchasesPackage[]>([]); const [sel, setSel] = useState(0); const [busy, setBusy] = useState(false);
  useEffect(() => { getPackages().then(p => { setPkgs(p); const y = p.findIndex(x => x.packageType === 'ANNUAL'); if (y >= 0) setSel(y); }).catch(() => {}); }, []);
  const go = async () => {
    if (!pkgs[sel]) return Alert.alert('Not available yet', 'Subscriptions are not set up in this build.');
    setBusy(true); try { if (await buy(pkgs[sel])) router.replace('/(tabs)'); } catch (e: any) { if (!e?.userCancelled) Alert.alert('Purchase didn’t go through', e?.message ?? ''); } finally { setBusy(false); }
  };
  if (!PAYMENTS_ENABLED) return <Redirect href="/(tabs)" />;
  return (
    <Screen>
      <View style={{ alignItems: 'center' }}><Thread width={160} /></View>
      <H1>Keep every story growing</H1>
      <P muted style={{ marginBottom: 12 }}>Everything in Whole Story, including event walls of any size.</P>
      {pkgs.map((p, i) => (
        <Pressable key={p.identifier} onPress={() => setSel(i)} style={{ borderWidth: 1.5, borderColor: sel === i ? C.green : C.line, backgroundColor: sel === i ? C.greenSoft : C.card, borderRadius: 14, padding: 14, marginBottom: 10 }}>
          <Text style={{ fontFamily: F.serif, fontSize: 18, color: C.navy }}>{p.packageType === 'ANNUAL' ? 'Yearly' : 'Monthly'} · {p.product.priceString}</Text>
          <Small>{p.packageType === 'ANNUAL' ? 'Best value, billed yearly' : 'Billed monthly'} · cancel anytime</Small>
        </Pressable>
      ))}
      <Btn title="Subscribe" onPress={go} busy={busy} />
      <Btn kind="link" title="Restore purchases" onPress={async () => { if (await restore()) router.replace('/(tabs)'); else Alert.alert('No purchases found'); }} />
      <Btn kind="link" title="Log out" onPress={async () => { const { error } = await supabase.auth.signOut(); if (error) throw error; router.replace('/'); }} />
      <Small style={{ textAlign: 'center' }}>Renews automatically until cancelled in {Platform.OS === 'android' ? 'Google Play' : 'your App Store settings'}.</Small>
    </Screen>
  );
}
