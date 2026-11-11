import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen, H1, P, Small } from '@/components/ui';
import { C, F } from '@/lib/theme';

const FORMAT_KEY = 'ws_date_format_v1';

export default function AppearanceSettings() {
  const [dateFormat, setDateFormat] = useState<'dmy' | 'mdy'>('dmy');

  useEffect(() => {
    AsyncStorage.getItem(FORMAT_KEY).then(v => { if (v === 'mdy') setDateFormat('mdy'); }).catch(() => {});
  }, []);

  const chooseFormat = (next: 'dmy' | 'mdy') => {
    setDateFormat(next);
    void AsyncStorage.setItem(FORMAT_KEY, next).catch(() => {});
  };

  return (
    <Screen>
      <H1>Appearance & language</H1>
      <P muted style={{ marginBottom: 14 }}>Display preferences for Whole Story on this phone.</P>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.title}>App theme</Text>
          <Text style={styles.value}>Warm Cream</Text>
        </View>
        <View style={[styles.row, styles.borderTop]}>
          <Text style={styles.title}>Language</Text>
          <Text style={styles.value}>English (UK)</Text>
        </View>
      </View>

      <Text style={styles.label}>Date format</Text>
      <View style={styles.card}>
        <Pressable onPress={() => chooseFormat('dmy')} style={styles.row}>
          <Text style={styles.title}>DD / MM / YYYY</Text>
          <Text style={{ color: dateFormat === 'dmy' ? C.green : C.faint, fontFamily: F.sansBold }}>{dateFormat === 'dmy' ? '✓' : ''}</Text>
        </Pressable>
        <Pressable onPress={() => chooseFormat('mdy')} style={[styles.row, styles.borderTop]}>
          <Text style={styles.title}>MM / DD / YYYY</Text>
          <Text style={{ color: dateFormat === 'mdy' ? C.green : C.faint, fontFamily: F.sansBold }}>{dateFormat === 'mdy' ? '✓' : ''}</Text>
        </Pressable>
      </View>
      <Small>Story dates follow your chosen region format across reminders and timelines.</Small>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, marginBottom: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 },
  borderTop: { borderTopWidth: 1, borderColor: C.line },
  title: { fontFamily: F.sansBold, fontSize: 14.5, color: C.navy },
  value: { fontFamily: F.sans, fontSize: 14, color: C.grey },
  label: { fontFamily: F.sansBold, fontSize: 13.5, color: C.navy, marginBottom: 6 },
});
