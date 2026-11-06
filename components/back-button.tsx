import { Pressable } from 'react-native';
import { Text } from './typography';
import { C, F } from '@/lib/theme';

export function BackButton({ onPress, disabled = false }: { onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Back" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 44, minWidth: 64, paddingRight: 12, justifyContent: 'center', opacity: disabled || pressed ? 0.5 : 1 })}>
    <Text style={{ fontFamily: F.sansMedium, fontSize: 16, color: C.green }}>‹ Back</Text>
  </Pressable>;
}
