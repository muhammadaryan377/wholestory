import { useId } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { C, F } from '@/lib/theme';
import type { StoryCategory } from '@/lib/story-preferences';
import { Thread } from './ui';
import { Icon, type IconName } from './icon';

/** Goes to the previous screen, or to Stories when there is none (a direct link). */
export const backToStories = () => {
  if (router.canGoBack()) router.back();
  else router.navigate('/(tabs)/stories');
};

export function BrandHeader({ back }: { back?: boolean }) {
  return (
    <View style={styles.brandRow}>
      {back ? <Pressable onPress={backToStories} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} style={{ marginLeft: -6 }}><Icon name="back" size={30} color={C.navy} /></Pressable> : null}
      <Text style={styles.brand} accessibilityRole="header" numberOfLines={1}>Whole Story</Text>
      <Thread width={92} />
      <View style={{ flex: 1 }} />
      <Pressable onPress={() => router.navigate('/(tabs)/settings')} accessibilityRole="button" accessibilityLabel="Open settings" hitSlop={12}><Icon name="gear" size={26} color={C.navy} /></Pressable>
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder, onFilter, filterOn, filterLabel }: { value: string; onChangeText: (text: string) => void; placeholder: string; onFilter: () => void; filterOn?: boolean; filterLabel: string }) {
  return (
    <View style={styles.search}>
      <Icon name="search" size={20} color={C.navy} />
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={C.grey} returnKeyType="search" style={styles.searchInput} />
      <Pressable onPress={onFilter} accessibilityRole="button" accessibilityLabel={filterLabel} accessibilityState={{ selected: !!filterOn }} hitSlop={10}><Icon name="sliders" size={21} color={filterOn ? C.green : C.navy} /></Pressable>
    </View>
  );
}

/** Dark fade that keeps white text readable over any photo. */
export function Scrim({ start = 0.35 }: { start?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset={start} stopColor="#000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000" stopOpacity={0.72} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

export type TagTone = 'red' | 'green' | 'blue';
const TONES: Record<TagTone, { background: string; color: string }> = {
  red: { background: '#FCEBE6', color: '#D2382B' },
  green: { background: '#EAF0E4', color: C.green },
  blue: { background: '#E7EFFC', color: '#1F5FD0' },
};
export const CATEGORY_TAGS: Record<StoryCategory, { icon: IconName; tone: TagTone }> = {
  Travel: { icon: 'plane', tone: 'blue' },
  Events: { icon: 'calendar', tone: 'red' },
  Family: { icon: 'people', tone: 'green' },
  Friends: { icon: 'people', tone: 'green' },
  'Everyday life': { icon: 'heart', tone: 'red' },
};

export function Tag({ label, icon, tone, onPress }: { label: string; icon: IconName; tone: TagTone; onPress?: () => void }) {
  const { background, color } = TONES[tone];
  const body = <><Icon name={icon} size={14} color={color} /><Text style={[styles.tagText, { color }]} numberOfLines={1}>{label}</Text></>;
  return onPress
    // No button role: tags sit inside a story row, and a button may not contain another button on web.
    ? <Pressable onPress={onPress} style={[styles.tag, { backgroundColor: background }]}>{body}</Pressable>
    : <View style={[styles.tag, { backgroundColor: background }]}>{body}</View>;
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  brand: { fontFamily: F.serif, fontSize: 28, color: C.navy, letterSpacing: -0.4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 15, borderRadius: 23, borderWidth: 1, borderColor: '#E0D9CD', backgroundColor: C.card, marginBottom: 12 },
  searchInput: { flex: 1, minWidth: 0, fontFamily: F.sans, fontSize: 14, color: C.ink, paddingVertical: 10 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 13, paddingHorizontal: 9, paddingVertical: 4, maxWidth: 130 },
  tagText: { fontFamily: F.sansMedium, fontSize: 12, flexShrink: 1 },
});
