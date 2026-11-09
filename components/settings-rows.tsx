import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, F } from '@/lib/theme';
import { runAction } from './ui';
import { Icon, type IconName } from './icon';

/** A titled card of rows separated by hairlines. Rows hidden with a condition leave no gap. */
export function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <View style={{ marginTop: 18 }}>
      {title ? <Text style={styles.title} accessibilityRole="header">{title}</Text> : null}
      <View style={styles.group}>
        {rows.map((row, index) => <View key={index}>{index > 0 ? <View style={styles.divider} /> : null}{row}</View>)}
      </View>
    </View>
  );
}

export function SettingsRow({ icon, title, sub, onPress, danger, disabled }: { icon: IconName; title: string; sub?: string; onPress: () => unknown; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={() => runAction(onPress)} disabled={disabled} accessibilityRole="button" accessibilityLabel={sub ? `${title}. ${sub}` : title}
      style={({ pressed }) => [styles.row, (pressed || disabled) && { opacity: 0.6 }]}>
      <View style={[styles.tile, danger && { backgroundColor: C.redSoft }]}><Icon name={icon} size={20} color={danger ? C.red : C.green} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowTitle, danger && { color: C.red }]}>{title}</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      <Icon name="forward" size={20} color={C.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: F.serif, fontSize: 20, color: C.navy, marginBottom: 8 },
  group: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: C.line, marginLeft: 62 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 12, paddingVertical: 9 },
  tile: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#E2EDD9', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: F.sansMedium, fontSize: 15, color: C.ink },
  sub: { fontFamily: F.sans, fontSize: 12.5, lineHeight: 17, color: C.grey, marginTop: 1 },
});
