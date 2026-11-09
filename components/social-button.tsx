import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { F } from '@/lib/theme';

type Props = {
  title: string;
  logo: ReactNode;
  /** Black button with white text (Apple) instead of the white one (Google). */
  dark?: boolean;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
};

/** "Continue with ..." button: the provider's logo on the left, the text centred. */
export function SocialButton({ title, logo, dark = false, onPress, busy = false, disabled = false }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [styles.button, dark ? styles.dark : styles.light, (pressed || disabled) && { opacity: 0.6 }]}
    >
      <View style={styles.logo}>{logo}</View>
      <Text style={[styles.text, { color: dark ? '#FFFFFF' : '#1F1F1F' }]}>{title}</Text>
      {busy ? <ActivityIndicator style={styles.spinner} size="small" color={dark ? '#FFFFFF' : '#1F1F1F'} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 50, borderRadius: 28, marginVertical: 6, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  dark: { backgroundColor: '#000000' },
  light: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DADCE0' },
  logo: { position: 'absolute', left: 20, top: 0, bottom: 0, justifyContent: 'center' },
  text: { fontFamily: F.sansMedium, fontSize: 16 },
  spinner: { position: 'absolute', right: 20 },
});
