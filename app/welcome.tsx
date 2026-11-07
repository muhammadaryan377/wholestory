import { useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ImageSourcePropType, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { C as theme, F } from '@/lib/theme';
import { useIntroVoice } from '@/lib/intro-voice';
import { useAuth } from '@/lib/auth';

const INTRO_SEEN_KEY = 'ws_intro_seen_v1';
// The introduction follows the supplied artwork without changing the app-wide palette.
const C = { ...theme, cream: '#FBF5ED', navy: '#061D3D', green: '#427D35', blue: '#0095FF', amber: '#FFBA00', dotGreen: '#4C9260', dotRed: '#FF3037' };

// Bundled in assets/onboarding/. Replace a file (same name) with the designer's original to upgrade quality.
const PHOTOS = {
  splash: require('../assets/onboarding/splash_glow_background.jpg'),
  hero: require('../assets/onboarding/hero_couple_clean.png'),
  dog: require('../assets/onboarding/photo_dog.jpg'),
  voice: require('../assets/onboarding/photo_voice.jpg'),
  greece: require('../assets/onboarding/timeline_greece.jpg'),
  dinner: require('../assets/onboarding/timeline_dinner.jpg'),
  engagement: require('../assets/onboarding/timeline_engagement.jpg'),
  friends: require('../assets/onboarding/collab_friends.jpg'),
  mountains: require('../assets/onboarding/collab_mountains.jpg'),
  outdoors: require('../assets/onboarding/collab_outdoors.jpg'),
  party: require('../assets/onboarding/collab_dinner.jpg'),
} as const;

const TOTAL = 5;
const VOICE_PAGE = 3;
const PX = 24;
const BARS = 27;
const SHAPE = Array.from({ length: BARS }, (_, i) => 0.3 + 0.7 * Math.abs(Math.sin(i * 0.8)));
const WAVE_PLAYED = C.blue;
const WAVE_REST = '#A9C9F4';
const DOT_SIZE = 8;
const DOT_STEP = 16;
const DOT_COUNT = TOTAL - 1; // the hero page has no progress dots
const SPLASH_MS = 1850;

const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The Whole Stories "journey" line: a coloured curve with four milestone dots. */
function DotsWave({ width = 235, height = 46 }: { width?: number; height?: number }) {
  const gradientId = `journey${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={width} height={height} viewBox="0 0 330 58">
      <Defs><LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor={C.amber} /><Stop offset="0.38" stopColor={C.blue} />
        <Stop offset="0.68" stopColor={C.dotGreen} /><Stop offset="1" stopColor={C.dotRed} />
      </LinearGradient></Defs>
      <Path d="M12 39 C55 22 85 8 125 15 S205 51 242 42 S292 28 318 20" stroke={`url(#${gradientId})`} strokeWidth={2} fill="none" />
      <Circle cx={12} cy={39} r={10} fill={C.amber} />
      <Circle cx={125} cy={15} r={10} fill={C.blue} />
      <Circle cx={212} cy={41} r={9} fill={C.dotGreen} />
      <Circle cx={318} cy={20} r={10} fill={C.dotRed} />
    </Svg>
  );
}

function Photo({ source, height, radius = 0, zoom = 1, tag }: { source: ImageSourcePropType; height: number; radius?: number; zoom?: number; tag?: { text: string; color: string } }) {
  return (
    <View style={{ width: '100%', height, borderRadius: radius, overflow: 'hidden', backgroundColor: C.line }}>
      <Image source={source} resizeMode="cover" style={{ width: '100%', height: '100%', transform: [{ scale: zoom }] }} />
      {tag ? (
        <View style={styles.tag}>
          <View style={[styles.tagDot, { backgroundColor: tag.color }]} />
          <Text style={styles.tagText} numberOfLines={1}>{tag.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Action({ label, onPress, arrow = true, disabled = false }: { label: string; onPress: () => void; arrow?: boolean; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.action, (pressed || disabled) && { opacity: 0.8 }]}>
      <Text style={styles.actionText}>{label}</Text>
      {arrow ? <Text style={styles.actionArrow}>→</Text> : null}
    </Pressable>
  );
}

function StoryCard({ title, date, source, height }: { title: string; date: string; source: ImageSourcePropType; height: number }) {
  return (
    <View style={styles.storyCard}>
      <View style={{ height, overflow: 'hidden', backgroundColor: C.line }}>
        <Image source={source} resizeMode="cover" style={{ width: '100%', height: '100%', transform: [{ scale: 1.05 }] }} />
      </View>
      <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.cardDate}>{date}</Text>
      </View>
    </View>
  );
}

function Icon({ name }: { name: 'mic' | 'stop' | 'play' | 'pause' }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      {name === 'mic' ? <>
        <Rect x={9} y={3} width={6} height={11} rx={3} fill={C.white} />
        <Path d="M6 11a6 6 0 0 0 12 0M12 17v4" stroke={C.white} strokeWidth={2} strokeLinecap="round" fill="none" />
      </> : null}
      {name === 'stop' ? <Rect x={7} y={7} width={10} height={10} rx={2} fill={C.white} /> : null}
      {name === 'play' ? <Path d="M8 5v14l11-7z" fill={C.white} /> : null}
      {name === 'pause' ? <><Rect x={7} y={5} width={3.5} height={14} rx={1} fill={C.white} /><Rect x={13.5} y={5} width={3.5} height={14} rx={1} fill={C.white} /></> : null}
    </Svg>
  );
}

/** Waveform: bar heights follow the live voice level while recording, and fill in blue as a recording plays back. */
function Wave({ level, progress }: { level: number; progress: number }) {
  const [v] = useState(() => new Animated.Value(level));
  useEffect(() => {
    Animated.timing(v, { toValue: level, duration: 120, useNativeDriver: true }).start();
  }, [level, v]);
  return (
    <View style={styles.wave}>
      {SHAPE.map((shape, i) => (
        <Animated.View key={i} style={{
          width: 3, height: 34, borderRadius: 2,
          backgroundColor: progress > 0 && i / BARS < progress ? WAVE_PLAYED : progress > 0 ? WAVE_REST : WAVE_PLAYED,
          transform: [{ scaleY: v.interpolate({ inputRange: [0, 1], outputRange: [0.12, shape] }) }],
        }} />
      ))}
    </View>
  );
}

function Pulse({ active }: { active: boolean }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) { v.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1100, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [active, v]);
  if (!active) return null;
  return <Animated.View pointerEvents="none" style={[styles.pulse, {
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
  }]} />;
}

function Page({ i, width, height, scrollX, children }: { i: number; width: number; height: number; scrollX: Animated.Value; children: ReactNode }) {
  const opacity = scrollX.interpolate({ inputRange: [(i - 1) * width, i * width, (i + 1) * width], outputRange: [0.2, 1, 0.2], extrapolate: 'clamp' });
  return <Animated.View style={{ width, height, opacity }}>
    <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={{ flexGrow: 1, minHeight: i === 0 ? height : Math.max(height, 560) }}>
      {children}
    </ScrollView>
  </Animated.View>;
}

export default function Welcome() {
  const { session } = useAuth();
  const signedIn = !!session && !session.user.is_anonymous;
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.min(windowWidth, 480);
  const insets = useSafeAreaInsets();
  const scroll = useRef<ComponentRef<typeof Animated.ScrollView>>(null);
  const [scrollX] = useState(() => new Animated.Value(0));
  const [splashOpacity] = useState(() => new Animated.Value(1));
  const finishing = useRef(false);
  const splashClosing = useRef(false);
  const indexRef = useRef(0);
  const programmatic = useRef(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [index, setIndex] = useState(0);
  const [viewH, setViewH] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const voice = useIntroVoice();
  const { leave } = voice;

  const pageH = Math.max(viewH, 560);
  const compact = viewH > 0 && viewH < 560;
  const photoH = Math.min(pageH * 0.53, 400);

  const closeSplash = useCallback(() => {
    if (splashClosing.current) return;
    splashClosing.current = true;
    Animated.timing(splashOpacity, { toValue: 0, duration: 450, useNativeDriver: true }).start(() => setSplashDone(true));
  }, [splashOpacity]);

  useEffect(() => {
    const t = setTimeout(closeSplash, SPLASH_MS);
    return () => clearTimeout(t);
  }, [closeSplash]);

  const syncFrom = useCallback((x: number) => {
    const next = Math.max(0, Math.min(TOTAL - 1, Math.round(x / width)));
    if (next !== indexRef.current) { indexRef.current = next; setIndex(next); }
  }, [width]);

  // Keeps the bottom button label in step with the page while the finger is still dragging.
  useEffect(() => {
    const id = scrollX.addListener(({ value }) => { if (!programmatic.current) syncFrom(value); });
    return () => scrollX.removeListener(id);
  }, [scrollX, syncFrom]);

  const onScroll = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: true },
  ), [scrollX]);

  const go = useCallback((target: number) => {
    const next = Math.max(0, Math.min(TOTAL - 1, target));
    if (next === indexRef.current && !programmatic.current) return;
    programmatic.current = true;
    indexRef.current = next;
    setIndex(next);
    scroll.current?.scrollTo({ x: next * width, animated: true });
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => { programmatic.current = false; }, 600);
  }, [width]);

  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);
  useEffect(() => {
    scroll.current?.scrollTo({ x: indexRef.current * width, animated: false });
    scrollX.setValue(indexRef.current * width);
  }, [width, scrollX]);
  useEffect(() => { if (index !== VOICE_PAGE) leave(); }, [index, leave]);

  const finish = useCallback(async (destination: '/sign-up' | '/sign-in' = '/sign-up') => {
    if (finishing.current) return;
    finishing.current = true;
    setNavigating(true);
    try {
      await AsyncStorage.setItem(INTRO_SEEN_KEY, '1');
      router.replace(signedIn ? '/(tabs)' : destination);
    } catch {
      finishing.current = false;
      setNavigating(false);
    }
  }, [signedIn]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    programmatic.current = false;
    syncFrom(e.nativeEvent.contentOffset.x);
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0 && h !== viewH) setViewH(h);
  };

  const voiceIdle = index === VOICE_PAGE && voice.phase === 'idle';
  const label = index === TOTAL - 1 ? (signedIn ? 'Back to Home' : 'Get started') : index === 0 ? 'Begin your story' : voiceIdle ? 'Try it' : 'Next';
  const showArrow = !(index === 0 || voiceIdle);
  const onAction = () => {
    if (voiceIdle) void voice.start();
    else if (index === TOTAL - 1) void finish();
    else go(index + 1);
  };

  const heroOpacity = scrollX.interpolate({ inputRange: [0, width * 0.8], outputRange: [1, 0], extrapolate: 'clamp' });
  const brandOpacity = scrollX.interpolate({ inputRange: [0, width * 0.5], outputRange: [0, 1], extrapolate: 'clamp' });
  const dotsOpacity = scrollX.interpolate({ inputRange: [0, width * 0.6], outputRange: [0, 1], extrapolate: 'clamp' });
  const loginOpacity = scrollX.interpolate({ inputRange: [0, width * 0.6], outputRange: [1, 0], extrapolate: 'clamp' });
  const pillX = scrollX.interpolate({ inputRange: [width, width * (TOTAL - 1)], outputRange: [0, DOT_STEP * (DOT_COUNT - 1)], extrapolate: 'clamp' });
  const rec = voice.phase === 'recording';
  const recorded = voice.phase === 'recorded';
  const bar = compact ? 44 : 62;

  const page = (i: number, children: ReactNode) => (
    <Page key={i} i={i} width={width} height={viewH || 560} scrollX={scrollX}>{children}</Page>
  );

  return (
    <View style={styles.stage}>
    <View style={[styles.root, { width, paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 12) }]}>
      {/* Full-bleed hero behind the first page; it fades away as you swipe on. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: heroOpacity }]}>
        <Image source={PHOTOS.hero} resizeMode="cover" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} />
        <Svg width="100%" height="100%" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="heroShade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#271407" stopOpacity={0} />
              <Stop offset="0.38" stopColor="#0B1B22" stopOpacity={0} />
              <Stop offset="0.6" stopColor="#271407" stopOpacity={0.22} />
              <Stop offset="1" stopColor="#271407" stopOpacity={0.9} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroShade)" />
        </Svg>
      </Animated.View>

      <View style={styles.header}>
        <Animated.Text style={[styles.brand, { opacity: brandOpacity }]} accessibilityRole="header">Whole Stories</Animated.Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Skip introduction"
          onPress={() => void finish()} disabled={navigating} hitSlop={16}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <Animated.ScrollView ref={scroll} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        bounces={false} directionalLockEnabled scrollEnabled={!navigating} decelerationRate="fast"
        scrollEventThrottle={16} onScroll={onScroll} onLayout={onLayout}
        onScrollBeginDrag={() => { programmatic.current = false; }}
        onMomentumScrollEnd={onMomentumEnd}
        keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
        {page(0, (
          <View style={{ flex: 1, paddingHorizontal: PX, justifyContent: 'space-between', paddingBottom: 8 }}>
            <View style={{ alignItems: 'center', marginTop: 0 }}>
              <Text accessibilityRole="header" style={[styles.heroBrand, { fontSize: width * (compact ? 0.12 : 0.145), lineHeight: width * (compact ? 0.115 : 0.139) }]}>{'Whole\nStories'}</Text>
              <DotsWave width={width * 0.67} height={46} />
            </View>
            <View>
              <Text style={[styles.heroTitle, { fontSize: width * (compact ? 0.088 : 0.108), lineHeight: width * (compact ? 0.095 : 0.115) }]}>{'A moment.\nA snapshot.\nA memory.'}</Text>
              <Text style={[styles.heroBody, compact && { fontSize: 16, lineHeight: 23 }]}>{'Capture your story and\nwatch it grow.'}</Text>
            </View>
          </View>
        ))}

        {page(1, <>
          <Photo source={PHOTOS.dog} height={photoH} />
          <View style={{ flex: 1, paddingHorizontal: PX, justifyContent: 'center' }}>
            <Text style={styles.headline}>{'Your photos\nshow a moment.'}</Text>
            <Text style={styles.description}>Whole Stories keeps the memories, voices and moments behind them.</Text>
            <View style={{ alignItems: 'center', marginTop: 4 }}><DotsWave width={Math.min(width - PX * 2, 320)} height={compact ? 36 : 46} /></View>
          </View>
        </>)}

        {page(2, (
          <View style={{ flex: 1, paddingHorizontal: PX }}>
            <View style={{ alignItems: 'flex-end', marginRight: -10 }}><DotsWave width={Math.min(width - 50, 280)} height={compact ? 26 : 33} /></View>
            <Text style={[styles.headline, { marginTop: 4 }]}>{'A story doesn’t end\nwith one photo.'}</Text>
            <Text style={styles.description}>Add new moments and watch your story grow.</Text>
            <View style={{ flex: 1, paddingLeft: 30, justifyContent: 'space-evenly' }}>
              <View style={styles.rail} />
              {[
                { title: 'Holiday in Greece', date: 'Tue 12 Jul 2022', source: PHOTOS.greece, dot: C.amber },
                { title: 'Dinner with the crew', date: 'Sat 20 Aug 2022', source: PHOTOS.dinner, dot: C.blue },
                { title: 'Our engagement', date: 'Sun 14 Apr 2024', source: PHOTOS.engagement, dot: C.dotRed },
              ].map(story => (
                <View key={story.title}>
                  <View style={[styles.railDot, { backgroundColor: story.dot }]} />
                  <StoryCard title={story.title} date={story.date} source={story.source} height={Math.min(90, Math.max(58, pageH * 0.12))} />
                </View>
              ))}
            </View>
          </View>
        ))}

        {page(VOICE_PAGE, <>
          {compact ? null : <View style={{ alignItems: 'center', marginBottom: 6 }}><DotsWave width={Math.min(width - 60, 290)} height={30} /></View>}
          <Photo source={PHOTOS.voice} height={Math.min(pageH * 0.39, 285)} />
          <View style={{ flex: 1, paddingHorizontal: PX, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={[styles.headline, { textAlign: 'center', marginTop: 8 }]}>{'Tell us why\nit mattered.'}</Text>
            <Text style={[styles.description, { textAlign: 'center' }]}>
              {rec ? 'Listening… tell us about a photo you love.'
                : recorded ? 'Lovely. Play it back, or record it again.'
                : 'Just tap and talk. Your memories, in your own words.'}
            </Text>
            <Wave level={rec ? Math.max(0.1, voice.level) : 1} progress={recorded && (voice.playing || voice.progress > 0) ? voice.progress : 0} />
            <Text style={styles.timer}>{rec || recorded ? fmt(voice.durationMs) : ' '}</Text>
            <View style={{ width: bar + 20, height: bar + 20, alignItems: 'center', justifyContent: 'center' }}>
              <Pulse active={rec} />
              {recorded ? (
                <Pressable accessibilityRole="button" accessibilityLabel={voice.playing ? 'Pause your recording' : 'Play your recording'}
                  onPress={() => void voice.togglePlay()} style={({ pressed }) => [styles.round, { width: bar, height: bar, borderRadius: bar / 2, backgroundColor: C.green }, pressed && { opacity: 0.8 }]}>
                  <Icon name={voice.playing ? 'pause' : 'play'} />
                </Pressable>
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel={rec ? 'Stop recording' : 'Start recording'}
                  onPress={() => void (rec ? voice.stop() : voice.start())} style={({ pressed }) => [styles.round, { width: bar, height: bar, borderRadius: bar / 2, backgroundColor: C.dotRed }, pressed && { opacity: 0.8 }]}>
                  <Icon name={rec ? 'stop' : 'mic'} />
                </Pressable>
              )}
            </View>
            {recorded ? (
              <Pressable accessibilityRole="button" onPress={() => void voice.start()} hitSlop={10} style={{ paddingVertical: 4 }}>
                <Text style={styles.again}>Record again</Text>
              </Pressable>
            ) : <Text style={styles.again}>{rec ? 'Tap to stop' : ' '}</Text>}
          </View>
        </>)}

        {page(4, (
          <View style={{ flex: 1, paddingHorizontal: PX }}>
            <View style={{ alignItems: 'flex-end' }}><DotsWave width={width * 0.7} height={42} /></View>
            <Text style={[styles.headline, { marginTop: compact ? 4 : 14 }]}>{'More than your\nperspective.'}</Text>
            <Text style={styles.description}>Invite the people who were there to add their photos and stories too.</Text>
            <View style={{ flex: 1, flexDirection: 'row', gap: 12, marginBottom: 8 }}>
              <View style={{ flex: 1, gap: 12 }}>
                <Photo source={PHOTOS.friends} radius={15} zoom={1.05} tag={{ text: 'Sarah added 5 photos', color: C.amber }} height={Math.min(pageH * 0.27, 150)} />
                <Photo source={PHOTOS.outdoors} radius={15} zoom={1.05} tag={{ text: 'Aisha added a video', color: C.dotGreen }} height={Math.min(pageH * 0.3, 170)} />
              </View>
              <View style={{ flex: 1, gap: 12, marginTop: 14 }}>
                <Photo source={PHOTOS.mountains} radius={15} zoom={1.05} tag={{ text: 'Bilal’s story', color: C.blue }} height={Math.min(pageH * 0.3, 170)} />
                <Photo source={PHOTOS.party} radius={15} zoom={1.05} tag={{ text: 'Sameer’s note', color: C.dotRed }} height={Math.min(pageH * 0.27, 150)} />
              </View>
            </View>
          </View>
        ))}
      </Animated.ScrollView>

      <View style={{ paddingHorizontal: PX, gap: 12, paddingTop: 12 }}>
        <Animated.View style={[styles.dots, { opacity: dotsOpacity }]} pointerEvents={index === 0 ? 'none' : 'auto'}>
          {Array.from({ length: DOT_COUNT }, (_, i) => (
            <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Go to introduction page ${i + 1} of ${DOT_COUNT}`}
              hitSlop={8} onPress={() => go(i + 1)} style={styles.pagerDot} />
          ))}
          <Animated.View pointerEvents="none" style={[styles.pagerActive, { transform: [{ translateX: pillX }] }]} />
        </Animated.View>
        <Action label={label} arrow={showArrow} onPress={onAction} disabled={navigating} />
        <Animated.View style={{ opacity: loginOpacity, height: index === 0 ? 28 : 0, overflow: 'hidden' }} pointerEvents={index === 0 ? 'auto' : 'none'}>
          <Pressable accessibilityRole="button" disabled={navigating || index !== 0} onPress={() => void finish('/sign-in')} style={{ alignItems: 'center', paddingVertical: 5 }}>
            <Text style={styles.loginText}>{signedIn ? 'Return to your stories. ' : 'Already have an account? '}<Text style={styles.loginLink}>{signedIn ? 'Home' : 'Log in'}</Text></Text>
          </Pressable>
        </Animated.View>
        {index > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => go(index - 1)} disabled={navigating} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 3 }}><Text style={styles.back}>Back</Text></Pressable> : null}
      </View>

      {/* Splash: soft glow background with the Whole Stories logo, then fades into the hero. */}
      {splashDone ? null : (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: splashOpacity, zIndex: 20 }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSplash} accessibilityRole="button" accessibilityLabel="Whole Stories. Tap to continue">
            <Image source={PHOTOS.splash} resizeMode="cover" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} />
            <Svg width="100%" height="100%" viewBox="0 0 400 850" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
              <Path d="M-30 70 C70 340 220 250 435 405 M-40 505 C140 580 250 700 440 795 M-15 750 Q230 530 440 750" fill="none" stroke="white" strokeWidth={10} opacity={0.15} />
              <Path d="M-30 70 C70 340 220 250 435 405 M-40 505 C140 580 250 700 440 795 M-15 750 Q230 530 440 750" fill="none" stroke="white" strokeWidth={2.3} opacity={0.8} />
              <Circle cx={90} cy={170} r={28} fill="#FFFBE7" opacity={0.5} /><Circle cx={73} cy={280} r={18} fill="#FFFADE" opacity={0.65} />
              <Circle cx={111} cy={650} r={30} fill="#FFFBE7" opacity={0.45} />
            </Svg>
            <View style={styles.splashCenter}>
              <Text style={[styles.splashLogo, { fontSize: width * 0.19, lineHeight: width * 0.182 }]}>{'Whole\nStories'}</Text>
              <DotsWave width={Math.min(width * 0.68, 260)} height={46} />
            </View>
          </Pressable>
        </Animated.View>
      )}
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: '#E9E4DC', alignItems: 'center' },
  root: { flex: 1, backgroundColor: C.cream, overflow: 'hidden' },
  header: { paddingHorizontal: PX, paddingBottom: 16, paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 62 },
  brand: { color: C.navy, fontFamily: F.serif, fontSize: 28 },
  skip: { color: C.navy, fontFamily: F.sansMedium, fontSize: 14 },
  heroBrand: { fontFamily: F.serif, color: C.navy, textAlign: 'center', letterSpacing: -1.5, marginBottom: 8 },
  heroTitle: { fontFamily: F.serif, color: C.white, letterSpacing: -0.5, marginBottom: 10 },
  heroBody: { fontFamily: F.sans, color: C.white, fontSize: 19, lineHeight: 28, marginBottom: 12 },
  headline: { fontFamily: F.serif, fontSize: 34, lineHeight: 39, color: C.navy, marginTop: 18, letterSpacing: -0.6 },
  description: { color: C.navy, fontSize: 16, lineHeight: 24, fontFamily: F.sans, marginTop: 10, marginBottom: 16 },
  rail: { position: 'absolute', left: 8, top: 14, bottom: 14, width: 2, backgroundColor: '#A9BFAC' },
  railDot: { position: 'absolute', left: -30, top: 22, width: 16, height: 16, borderRadius: 8, zIndex: 1 },
  storyCard: { overflow: 'hidden', borderRadius: 13, backgroundColor: C.card, shadowColor: '#323031', shadowOpacity: 0.12, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardTitle: { fontFamily: F.serif, fontSize: 15, color: C.navy },
  cardDate: { fontFamily: F.sans, color: C.grey, fontSize: 10, marginTop: 1 },
  tag: { position: 'absolute', left: 7, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '92%', backgroundColor: C.white, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 9 },
  tagDot: { width: 10, height: 10, borderRadius: 5 },
  tagText: { fontFamily: F.sansBold, color: C.navy, fontSize: 10, flexShrink: 1 },
  wave: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  timer: { fontFamily: F.sansMedium, color: C.grey, fontSize: 13, marginTop: 4, marginBottom: 2 },
  round: { alignItems: 'center', justifyContent: 'center' },
  pulse: { position: 'absolute', width: 62, height: 62, borderRadius: 31, backgroundColor: C.dotRed },
  again: { fontFamily: F.sansMedium, color: C.green, fontSize: 13, textDecorationLine: 'underline', minHeight: 18 },
  dots: { flexDirection: 'row', alignSelf: 'center', gap: DOT_STEP - DOT_SIZE },
  pagerDot: { width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, backgroundColor: '#CBC9C2' },
  pagerActive: { position: 'absolute', left: -6, top: 0, width: 20, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, backgroundColor: C.navy },
  action: { minHeight: 54, backgroundColor: C.green, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  actionText: { fontFamily: F.sansBold, color: C.white, fontSize: 17 },
  actionArrow: { position: 'absolute', right: 24, fontFamily: F.sans, color: C.white, fontSize: 24 },
  loginText: { color: C.white, fontFamily: F.sans, fontSize: 13 },
  loginLink: { textDecorationLine: 'underline', fontFamily: F.sansBold },
  back: { color: C.navy, fontFamily: F.sansMedium, fontSize: 13 },
  splashCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 30 },
  splashLogo: { fontFamily: F.serif, color: C.navy, textAlign: 'center', letterSpacing: -2.5, marginBottom: 14 },
});
