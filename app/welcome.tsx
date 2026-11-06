import { useCallback, useRef, useState } from 'react';
import { Animated, ScrollView, View, Pressable } from 'react-native';
import { Text } from '@/components/typography';
import { router } from 'expo-router';
import { Screen, H1, P, Btn, BrandLogo, Small } from '@/components/ui';
import { useHardwareBack } from '@/lib/use-hardware-back';
import { useMobileLayout } from '@/lib/use-mobile-layout';
import { C, F } from '@/lib/theme';

const PAGES = [
  ['A moment. A snapshot. A memory.', 'Capture your story and watch it grow.'],
  ['Your photos show a moment.', 'Wholestory keeps the memories, voices and moments behind them.'],
  ['A story doesn’t end with one photo.', 'Add new moments over time and watch your story grow.'],
  ['Tell us why it mattered.', 'Just tap and talk. Your memories, in your own words.'],
  ['More than your perspective.', 'Invite the people who were there to add their photos and stories too.'],
];

export default function Welcome() {
  const { compact, contentWidth } = useMobileLayout();
  const [page, setPage] = useState(0);
  const [scrollX] = useState(() => new Animated.Value(0));
  const pager = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const activePage = useRef(0);

  const goTo = useCallback((next: number) => {
    const target = Math.max(0, Math.min(next, PAGES.length - 1));
    activePage.current = target;
    pager.current?.scrollTo({ x: target * contentWidth, animated: true });
  }, [contentWidth]);

  const previous = useCallback(() => {
    if (activePage.current === 0) return false;
    goTo(activePage.current - 1);
    return true;
  }, [goTo]);
  useHardwareBack(previous);

  return (
    <Screen style={{ justifyContent: 'space-between', gap: compact ? 16 : 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ minWidth: 64 }} />
        <Small>{page + 1} of {PAGES.length}</Small>
        <Btn title="Skip" kind="link" onPress={() => router.navigate('/sign-up')} />
      </View>

      <View style={{ alignItems: 'center', marginTop: compact ? 12 : 40 }}>
        <BrandLogo />
        <Text style={{ fontFamily: F.serifRegular, fontSize: 16, color: C.grey, marginTop: 6 }}>Keep the whole story.</Text>
      </View>

      <Animated.ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        bounces={false}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        onMomentumScrollEnd={event => {
          const index = Math.max(0, Math.min(Math.round(event.nativeEvent.contentOffset.x / contentWidth), PAGES.length - 1));
          activePage.current = index;
          setPage(index);
        }}
        style={{ flexGrow: 0, height: compact ? 220 : 250 }}
      >
        {PAGES.map(([title, description], index) => {
          const opacity = scrollX.interpolate({
            inputRange: [(index - 1) * contentWidth, index * contentWidth, (index + 1) * contentWidth],
            outputRange: [0.55, 1, 0.55],
            extrapolate: 'clamp',
          });
          const translateY = scrollX.interpolate({
            inputRange: [(index - 1) * contentWidth, index * contentWidth, (index + 1) * contentWidth],
            outputRange: [5, 0, 5],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View key={title} style={{ width: contentWidth, paddingRight: 4, justifyContent: 'center', opacity, transform: [{ translateY }] }}>
              <H1 style={{ fontSize: compact ? 28 : 32 }}>{title}</H1>
              <P muted style={{ fontSize: 16 }}>{description}</P>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>

      <View style={{ flexDirection: 'row', gap: 6, alignSelf: 'center' }}>
        {PAGES.map((_, index) => (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityLabel={`Introduction ${index + 1} of ${PAGES.length}`}
            accessibilityState={{ selected: index === page }}
            onPress={() => goTo(index)}
            style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
          >
            <View style={{ width: index === page ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: index === page ? C.green : '#D8D2C6' }} />
          </Pressable>
        ))}
      </View>

      <View>
        <Btn title={page === PAGES.length - 1 ? 'Begin your story' : 'Next'} onPress={() => (page === PAGES.length - 1 ? router.navigate('/sign-up') : goTo(page + 1))} />
        <Btn kind="link" title="Already have an account? Log in" onPress={() => router.navigate('/sign-in')} />
      </View>
    </Screen>
  );
}
