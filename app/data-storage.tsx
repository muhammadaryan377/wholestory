import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Alert } from '@/lib/alert';
import { Screen, H1, P, Small } from '@/components/ui';
import { SettingsGroup, SettingsRow } from '@/components/settings-rows';
import { useFocusResource } from '@/lib/use-focus-resource';
import { listEvents, listStories } from '@/lib/api';
import { exportMyData } from '@/lib/exporter';
import { C, F } from '@/lib/theme';

const loadSummary = async () => {
  const [stories, events] = await Promise.all([listStories(), listEvents()]);
  return { stories: stories.length, photos: stories.reduce((n, s) => n + (s.photoCount ?? 0), 0), events: events.length };
};

export default function DataStorageSettings() {
  const { data } = useFocusResource(loadSummary);
  const [exporting, setExporting] = useState('');

  const download = async () => {
    if (exporting) return;
    setExporting('Preparing…');
    try { await exportMyData(setExporting); }
    catch (e: any) { Alert.alert('Could not download', e?.message ?? 'Please try again.'); }
    finally { setExporting(''); }
  };

  return (
    <Screen>
      <H1>Data & storage</H1>
      <P muted style={{ marginBottom: 14 }}>Manage your stories, photos, recordings and backups.</P>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Saved in Whole Story</Text>
        <Small style={{ marginTop: 4 }}>
          {data
            ? `${data.stories} ${data.stories === 1 ? 'story' : 'stories'} · ${data.photos} ${data.photos === 1 ? 'photo' : 'photos'} · ${data.events} ${data.events === 1 ? 'event wall' : 'event walls'}`
            : 'Loading your account summary…'}
        </Small>
      </View>

      <SettingsGroup>
        <SettingsRow icon="book" title="Manage stories & media" sub="Review, hide or delete individual stories" onPress={() => router.navigate('/(tabs)/stories')} />
        <SettingsRow icon="download" title={exporting || 'Download your data'} sub="Export a copy of your photos, recordings and stories" onPress={download} disabled={!!exporting} />
      </SettingsGroup>
      <Small>Your original photos always stay in your phone’s own photo library.</Small>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: 14 },
  summaryTitle: { fontFamily: F.serif, fontSize: 19, color: C.navy },
});
