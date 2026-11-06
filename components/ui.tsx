import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Pressable, StyleSheet, Switch, TextInput, View, ViewStyle, TextInputProps } from 'react-native';
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
import { Text } from '@/components/typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { C, F, S } from '@/lib/theme';
import { Alert } from '@/lib/alert';
import { useMobileLayout } from '@/lib/use-mobile-layout';

export function runAction(action?: () => unknown) {
  try {
    return Promise.resolve(action?.()).then(() => {}).catch(error => Alert.alert('Could not complete', error?.message ?? 'Please try again.'));
  } catch (error) { Alert.alert('Could not complete', error instanceof Error ? error.message : 'Please try again.'); return Promise.resolve(); }
}

export function Thread({ width = 120 }: { width?: number }) {
  return (
    <Svg width={width} height={width * 0.26} viewBox="0 0 160 42">
      <Path d="M0 36 C28 32 40 10 70 12 S112 36 130 24 S150 12 160 14" fill="none" stroke="#9AA58F" strokeWidth={1.3} />
      <Circle cx={48} cy={16} r={6} fill={C.amber} /><Circle cx={80} cy={14} r={6} fill={C.blue} />
      <Circle cx={116} cy={29} r={6} fill={C.dotGreen} /><Circle cx={150} cy={13} r={6} fill={C.dotRed} />
    </Svg>
  );
}
export function Screen({ children, scroll = true, style, resetKey }: { children: React.ReactNode; scroll?: boolean; style?: ViewStyle; resetKey?: string | number }) {
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [resetKey]);
  const { padding } = useMobileLayout();
  const contentStyle: ViewStyle = { width: '100%', maxWidth: 680, alignSelf: 'center', padding, paddingBottom: 32, flexGrow: 1 };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.cream }} edges={['top', 'left', 'right', 'bottom']}>
      {scroll ? <KeyboardAwareScrollView ref={scrollRef} bottomOffset={24} contentContainerStyle={[contentStyle, style]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">{children}</KeyboardAwareScrollView>
        : <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding"><View style={[contentStyle, { flex: 1 }, style]}>{children}</View></KeyboardAvoidingView>}
    </SafeAreaView>
  );
}
export const H1 = ({ children, style }: any) => <Text style={[st.h1, style]}>{children}</Text>;
export const H2 = ({ children, style }: any) => <Text style={[st.h2, style]}>{children}</Text>;
export const P = ({ children, style, muted }: any) => <Text style={[st.p, muted && { color: C.grey }, style]}>{children}</Text>;
export const Small = ({ children, style }: any) => <Text style={[st.small, style]}>{children}</Text>;

export function Btn({ title, onPress, kind = 'primary', busy, disabled, style }: { title: string; onPress?: () => void; kind?: 'primary' | 'outline' | 'danger' | 'link'; busy?: boolean; disabled?: boolean; style?: ViewStyle }) {
  const k = kind;
  const pending = useRef(false);
  return (
    <Pressable onPress={() => { if (pending.current) return; pending.current = true; void runAction(onPress).finally(() => { pending.current = false; }); }} disabled={busy || disabled} accessibilityRole="button" accessibilityState={{ disabled: !!(busy || disabled), busy: !!busy }}
      style={({ pressed }) => [k === 'link' ? st.link : st.btn, k === 'outline' && st.btnOutline, k === 'danger' && { backgroundColor: C.red }, (pressed || disabled) && { opacity: 0.6 }, style]}>
      {busy ? <ActivityIndicator color={k === 'outline' ? C.green : C.white} /> :
        <Text style={k === 'link' ? st.linkText : [st.btnText, k === 'outline' && { color: C.ink }]}>{title}</Text>}
    </Pressable>
  );
}
export const Card = ({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) =>
  onPress ? <Pressable onPress={() => runAction(onPress)} style={({ pressed }) => [st.card, pressed && { opacity: 0.85 }, style]}>{children}</Pressable> : <View style={[st.card, style]}>{children}</View>;

export function Field(props: TextInputProps & { label?: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      {props.label ? <Text style={st.label}>{props.label}</Text> : null}
      <TextInput placeholderTextColor={C.faint} {...props} style={[st.input, props.multiline && { minHeight: 96, textAlignVertical: 'top' }, props.style]} />
    </View>
  );
}
export function ToggleRow({ title, sub, value, onChange }: { title: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={st.row}>
      <View style={{ flex: 1, paddingRight: 12 }}><Text style={st.rowTitle}>{title}</Text>{sub ? <Text style={st.small}>{sub}</Text> : null}</View>
      <Switch value={value} onValueChange={v => runAction(() => onChange(v))} trackColor={{ true: C.green, false: '#CFCCC4' }} thumbColor={C.white} />
    </View>
  );
}
export function NavRow({ title, sub, onPress, danger }: { title: string; sub?: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={() => runAction(onPress)} style={({ pressed }) => [st.row, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1 }}><Text style={[st.rowTitle, danger && { color: C.red }]}>{title}</Text>{sub ? <Text style={st.small}>{sub}</Text> : null}</View>
      <Text style={{ color: C.faint, fontSize: 20 }}>›</Text>
    </Pressable>
  );
}
export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void }) {
  return <Pressable onPress={() => runAction(onPress)} style={[st.chip, on && { backgroundColor: C.green, borderColor: C.green }]}><Text style={[st.chipText, on && { color: C.white }]}>{label}</Text></Pressable>;
}
export function Empty({ title, body, action, onAction, secondary, onSecondary }: { title: string; body: string; action?: string; onAction?: () => void; secondary?: string; onSecondary?: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 28 }}>
      <Thread />
      <H2 style={{ textAlign: 'center', marginTop: 8 }}>{title}</H2>
      <P muted style={{ textAlign: 'center', marginBottom: 14 }}>{body}</P>
      {action ? <Btn title={action} onPress={onAction} style={{ alignSelf: 'stretch' }} /> : null}
      {secondary ? <Btn title={secondary} kind="outline" onPress={onSecondary} style={{ alignSelf: 'stretch' }} /> : null}
    </View>
  );
}
export function BrandLogo() {
  const { contentWidth } = useMobileLayout();
  const width = Math.min(contentWidth, 280);
  return <Image source={require('../assets/images/splash-icon.png')} resizeMode="contain" accessibilityLabel="Wholestory" style={{ width, height: width / 3 }} />;
}
export const Loading = () => <View style={{ flex: 1, gap: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cream }}><BrandLogo /><ActivityIndicator color={C.green} accessibilityLabel="Loading" /></View>;
export function LoadError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <Screen><H1>Could not load</H1><P accessibilityRole="alert">{error}</P><Btn title="Try again" onPress={onRetry} /></Screen>;
}

export const st = StyleSheet.create({
  h1: { fontFamily: F.serif, fontSize: 30, color: C.navy, marginBottom: 6, letterSpacing: -0.3 },
  h2: { fontFamily: F.serif, fontSize: 21, color: C.navy, marginBottom: 6 },
  p: { fontFamily: F.sans, fontSize: 15, color: C.ink, lineHeight: 21 },
  small: { fontFamily: F.sans, fontSize: 12.5, color: C.grey, lineHeight: 17 },
  btn: { backgroundColor: C.green, borderRadius: 28, paddingVertical: 15, paddingHorizontal: 20, alignItems: 'center', marginVertical: 6 },
  btnOutline: { backgroundColor: C.card, borderWidth: 1, borderColor: '#D8D2C6' },
  btnText: { fontFamily: F.serif, fontSize: 17, color: C.white, textAlign: 'center', flexShrink: 1 },
  link: { minHeight: 48, paddingVertical: 12, justifyContent: 'center', alignItems: 'center' },
  linkText: { fontFamily: F.sansMedium, fontSize: 14, color: C.green, textDecorationLine: 'underline', textAlign: 'center' },
  card: { backgroundColor: C.card, borderRadius: S.radius, borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: S.gap },
  label: { fontFamily: F.sansBold, fontSize: 13, color: C.ink, marginBottom: 6 },
  input: { minHeight: 48, backgroundColor: C.card, borderWidth: 1, borderColor: '#E0D9CD', borderRadius: 14, padding: 12, fontFamily: F.sans, fontSize: 16, color: C.ink },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, marginBottom: 8 },
  rowTitle: { fontFamily: F.sansBold, fontSize: 15, color: C.ink },
  chip: { borderWidth: 1, borderColor: '#D8D2C6', backgroundColor: C.card, borderRadius: 18, paddingVertical: 7, paddingHorizontal: 13, marginRight: 8, marginBottom: 8 },
  chipText: { fontFamily: F.sans, fontSize: 13, color: C.ink },
});
