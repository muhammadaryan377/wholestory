import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { H1 } from '@/components/ui';
import { C } from '@/lib/theme';

export type AuthStatusIcon = 'mail' | 'check' | 'alert' | 'busy';

function Glyph({ icon }: { icon: AuthStatusIcon }) {
  if (icon === 'busy') return <ActivityIndicator color={C.green} />;
  const color = icon === 'alert' ? C.red : C.green;
  return (
    <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {icon === 'mail' ? <>
        <Rect x={3} y={5} width={18} height={14} rx={2.5} />
        <Path d="M3.5 7.5 12 13l8.5-5.5" />
      </> : null}
      {icon === 'check' ? <Path d="M5 12.5 10 17.5 19.5 7" /> : null}
      {icon === 'alert' ? <Path d="M12 5v9M12 18.5v.01" /> : null}
    </Svg>
  );
}

/** Centred icon and heading shared by the email confirmation screens. */
export function AuthStatus({ icon, title, children }: { icon: AuthStatusIcon; title: string; children?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', marginTop: 32, marginBottom: 20 }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <Glyph icon={icon} />
      </View>
      <H1 style={{ textAlign: 'center' }}>{title}</H1>
      {children}
    </View>
  );
}
