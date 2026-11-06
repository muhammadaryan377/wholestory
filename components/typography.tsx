import { forwardRef, type ComponentRef } from 'react';
import { Text as NativeText, type TextProps } from 'react-native';
import { F } from '@/lib/theme';

// Use the bundled font on every screen, including unstyled labels and dialogs.
// Keep the device's accessibility text scaling enabled.
export const Text = forwardRef<ComponentRef<typeof NativeText>, TextProps>(function Text({ style, ...props }, ref) {
  return <NativeText ref={ref} {...props} style={[{ fontFamily: F.sans }, style]} />;
});
