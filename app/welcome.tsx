import { useCallback, useRef, useState, type ComponentRef } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '@/lib/theme';

const INTRO_SEEN_KEY = 'ws_intro_seen_v1';

// Temporary photo sources for the interactive preview. Replace these URIs with
// bundled assets/onboarding photos before releasing a production build.
const PHOTOS = {
  couple: 'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?w=1000&q=85',
  dog: 'https://images.unsplash.com/photo-1552053831-71594a27632d?w=1000&q=85',
  travel: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=900&q=80',
  dinner: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=900&q=80',
  sunset: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=1000&q=85',
  friends: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=900&q=80',
} as const;

const TOTAL = 5;
const DOTS = ['#F5AC24', '#2E91F5', '#9DBCA4', '#F05B55'];

function StoryLine() {
  return (
    <View style={styles.storyLine}>
      {DOTS.map((color, i) => <View key={color} style={[styles.storyDot, { backgroundColor: color, marginTop: i % 2 ? -8 : 8 }]} />)}
    </View>
  );
}

function Photo({ uri, height, radius = 20 }: { uri: string; height: number; radius?: number }) {
  return <Image source={{ uri }} resizeMode="cover" style={{ width: '100%', height, borderRadius: radius, backgroundColor: '#E8DBCC' }} />;
}

function Action({ label, onPress, secondary = false, disabled = false }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.action, secondary && styles.secondaryAction, pressed && { opacity: 0.8 }]}>
      <Text style={[styles.actionText, secondary && { color: C.navy }]}>{label}</Text>
      {!secondary ? <Text style={styles.actionText}>→</Text> : null}
    </Pressable>
  );
}

function StoryCard({ title, date, uri, height }: { title: string; date: string; uri: string; height: number }) {
  return (
    <View style={styles.storyCard}>
      <Image source={{ uri }} resizeMode="cover" style={{ width: '100%', height, backgroundColor: '#E4DAD0' }} />
      <View style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.cardDate}>{date}</Text>
      </View>
    </View>
  );
}

export default function Welcome() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const locked = useRef(false);
  const [index, setIndex] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const compact = height < 740;
  const photoHeight = Math.min(Math.max(height * 0.36, 180), 320);
  const contentHeight = Math.max(0, height - insets.top - insets.bottom - 128);

  const go = useCallback((next: number) => {
    if (locked.current || next < 0 || next >= TOTAL) return;
    scroll.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  }, [width]);

  const finish = useCallback(async (destination: '/sign-up' | '/sign-in' = '/sign-up') => {
    if (locked.current) return;
    locked.current = true;
    setNavigating(true);
    try {
      await AsyncStorage.setItem(INTRO_SEEN_KEY, '1');
      router.replace(destination);
    } catch {
      locked.current = false;
      setNavigating(false);
    }
  }, []);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(Math.max(0, Math.min(TOTAL - 1, next)));
  };

  const page = (children: React.ReactNode, key: string) => (
    <View key={key} style={{ width, paddingHorizontal: 22, paddingBottom: 10 }}>
      <View style={{ flex: 1, minHeight: contentHeight }}>{children}</View>
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.header}>
        <Text style={styles.brand}>Whole Stories</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Skip introduction"
          onPress={() => finish()} disabled={navigating} hitSlop={12}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView ref={scroll} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        bounces={false} directionalLockEnabled scrollEnabled={!navigating}
        decelerationRate="fast" onMomentumScrollEnd={onScrollEnd}
        onScrollEndDrag={e => { if (!e.nativeEvent.velocity?.x) onScrollEnd(e); }}
        keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
        {page(<>
          <StoryLine />
          <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 16 }}>
            <Photo uri={PHOTOS.couple} height={Math.min(photoHeight + 70, compact ? 310 : 390)} />
          </View>
          <Text style={styles.headline}>A moment.\nA snapshot.\nA memory.</Text>
          <Text style={styles.description}>Capture your story and watch it grow.</Text>
        </>, 'welcome')}

        {page(<>
          <Photo uri={PHOTOS.dog} height={photoHeight + (compact ? 0 : 40)} />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={styles.headline}>Your photos\nshow a moment.</Text>
            <Text style={styles.description}>Whole Stories keeps the memories, voices and moments behind them.</Text>
            <StoryLine />
          </View>
        </>, 'photos')}

        {page(<>
          <StoryLine />
          <Text style={styles.headline}>A story doesn’t end\nwith one photo.</Text>
          <Text style={styles.description}>Add new moments and watch your story grow.</Text>
          <View style={{ flex: 1, justifyContent: 'space-evenly', paddingTop: 8 }}>
            <StoryCard title="Holiday in Greece" date="12 Jul 2022" uri={PHOTOS.travel} height={compact ? 50 : 75} />
            <StoryCard title="Dinner with the crew" date="20 Aug 2022" uri={PHOTOS.dinner} height={compact ? 50 : 75} />
            <StoryCard title="Our engagement" date="14 Apr 2024" uri={PHOTOS.sunset} height={compact ? 50 : 75} />
          </View>
        </>, 'timeline')}

        {page(<>
          <StoryLine />
          <Photo uri={PHOTOS.sunset} height={photoHeight + (compact ? 0 : 30)} />
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={[styles.headline, { textAlign: 'center' }]}>Tell us why\nit mattered.</Text>
            <Text style={[styles.description, { textAlign: 'center' }]}>Just tap and talk. Your memories, in your own words.</Text>
            <View style={styles.wave}>
              {Array.from({ length: 27 }, (_, i) => <View key={i} style={{ width: 3, height: 6 + Math.abs(Math.sin(i * 0.8)) * 26, backgroundColor: '#168CF0', borderRadius: 4 }} />)}
            </View>
            <View style={styles.mic}><Text style={{ fontSize: 26, color: 'white' }}>🎙</Text></View>
          </View>
        </>, 'voice')}

        {page(<>
          <StoryLine />
          <Text style={styles.headline}>More than your\nperspective.</Text>
          <Text style={styles.description}>Invite the people who were there to add their photos and stories too.</Text>
          <View style={{ flex: 1, flexDirection: 'row', gap: 10, marginTop: 22, marginBottom: 18 }}>
            <View style={{ flex: 1, gap: 10 }}>
              <Photo uri={PHOTOS.friends} height={Math.min(photoHeight * .62, 170)} />
              <Photo uri={PHOTOS.travel} height={Math.min(photoHeight * .62, 170)} />
            </View>
            <View style={{ flex: 1, gap: 10, marginTop: 22 }}>
              <Photo uri={PHOTOS.sunset} height={Math.min(photoHeight * .62, 170)} />
              <Photo uri={PHOTOS.dinner} height={Math.min(photoHeight * .62, 170)} />
            </View>
          </View>
        </>, 'community')}
      </ScrollView>

      <View style={{ paddingHorizontal: 22, gap: 14 }}>
        <View style={styles.dots}>
          {Array.from({ length: TOTAL }, (_, i) => (
            <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Go to introduction page ${i + 1}`}
              hitSlop={10} onPress={() => go(i)} style={[styles.pagerDot, { backgroundColor: i === index ? C.navy : '#CBC9C2', width: i === index ? 20 : 8 }]} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {index > 0 ? <View style={{ flex: 0.36 }}><Action label="Back" secondary onPress={() => go(index - 1)} disabled={navigating} /></View> : null}
          <View style={{ flex: 1 }}><Action label={index === TOTAL - 1 ? 'Get started' : index === 0 ? 'Begin your story' : 'Next'}
            onPress={() => index === TOTAL - 1 ? finish() : go(index + 1)} disabled={navigating} /></View>
        </View>
        <Pressable accessibilityRole="button" disabled={navigating} onPress={() => finish('/sign-in')} style={{ alignItems: 'center', paddingVertical: 5 }}>
          <Text style={{ color: C.grey, fontFamily: F.sans, fontSize: 13 }}>Already have an account? <Text style={{ textDecorationLine: 'underline' }}>Log in</Text></Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.cream },
  header: { paddingHorizontal: 22, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: C.navy, fontFamily: F.serif, fontSize: 28 },
  skip: { color: C.grey, fontFamily: F.sansMedium, fontSize: 14 },
  headline: { fontFamily: F.serif, fontSize: 32, lineHeight: 37, color: C.navy, marginTop: 18 },
  description: { color: C.grey, fontSize: 15, lineHeight: 22, fontFamily: F.sans, marginTop: 8, marginBottom: 12 },
  storyLine: { height: 35, marginTop: 2, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderBottomWidth: 1, borderBottomColor: '#D6DED5' },
  storyDot: { width: 13, height: 13, borderRadius: 7 },
  storyCard: { overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: '#EEE6DA', backgroundColor: '#FFF', marginBottom: 5 },
  cardTitle: { fontFamily: F.serif, fontSize: 15, color: C.navy },
  cardDate: { fontFamily: F.sans, color: C.grey, fontSize: 10 },
  wave: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  mic: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#F05B55', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, alignItems: 'center' },
  pagerDot: { height: 8, borderRadius: 4 },
  action: { minHeight: 52, backgroundColor: C.green, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 16 },
  secondaryAction: { backgroundColor: '#E9EDE5' },
  actionText: { fontFamily: F.sansMedium, color: '#FFFFFF', fontSize: 15 },
});
