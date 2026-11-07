import { useCallback, useRef, useState, type ComponentRef } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent, type ImageSourcePropType } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '@/lib/theme';

const INTRO_SEEN_KEY = 'ws_intro_seen_v1';

// Real bundled artwork from the approved Whole Stories design package.
// Keep these local so the introduction works offline and never shows broken remote photos.
const PHOTOS = {
  couple: require('../assets/onboarding/couple.jpg'),
  dog: require('../assets/onboarding/dog.jpg'),
  timeline: require('../assets/onboarding/timeline.jpg'),
  voice: require('../assets/onboarding/voice.jpg'),
  community: require('../assets/onboarding/community.jpg'),
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

function Photo({ uri, height, radius = 20, fit = 'cover' }: { uri: ImageSourcePropType; height: number; radius?: number; fit?: 'cover' | 'contain' }) {
  return <Image source={uri} resizeMode={fit} style={{ width: '100%', height, borderRadius: radius, backgroundColor: '#E8DBCC' }} />;
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
            <View style={{ position: 'relative' }}>
              <Photo uri={PHOTOS.couple} height={Math.min(photoHeight + 70, compact ? 310 : 390)} />
              <View style={styles.heroShade} />
              <Text style={styles.heroHeadline}>A moment.\nA snapshot.\nA memory.</Text>
            </View>
          </View>
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
          <View style={{ flex: 1, justifyContent: 'center', paddingTop: 8 }}>
            <Photo uri={PHOTOS.timeline} height={Math.min(photoHeight * 1.55, compact ? 325 : 420)} radius={14} fit="contain" />
          </View>
        </>, 'timeline')}

        {page(<>
          <StoryLine />
          <Photo uri={PHOTOS.voice} height={photoHeight + (compact ? 0 : 30)} />
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
          <View style={{ flex: 1, justifyContent: 'center', marginTop: 8, marginBottom: 12 }}>
            <Photo uri={PHOTOS.community} height={Math.min(photoHeight * 1.55, compact ? 325 : 420)} fit="contain" radius={18} />
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
  heroShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 135, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, backgroundColor: 'rgba(6, 18, 19, 0.42)' },
  heroHeadline: { position: 'absolute', left: 17, bottom: 20, color: C.white, fontFamily: F.serif, fontSize: 31, lineHeight: 35 },
  wave: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  mic: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#F05B55', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, alignItems: 'center' },
  pagerDot: { height: 8, borderRadius: 4 },
  action: { minHeight: 52, backgroundColor: C.green, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 16 },
  secondaryAction: { backgroundColor: '#E9EDE5' },
  actionText: { fontFamily: F.sansMedium, color: '#FFFFFF', fontSize: 15 },
});
