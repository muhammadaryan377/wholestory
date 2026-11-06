import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useMobileLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pageWidth = Math.min(width - insets.left - insets.right, 680);
  const padding = pageWidth < 360 ? 16 : 20;
  return { padding, pageWidth, contentWidth: Math.max(0, pageWidth - padding * 2), compact: height < 700 || fontScale > 1.3 };
}
