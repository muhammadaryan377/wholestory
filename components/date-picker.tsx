import { useMemo, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components/icon';
import { dateInput, parseDate } from '@/lib/dates';
import { C, F } from '@/lib/theme';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad2 = (n: number) => String(n).padStart(2, '0');
const toValue = (year: number, monthIndex: number, day: number, includeYear: boolean) =>
  includeYear ? `${pad2(day)}/${pad2(monthIndex + 1)}/${year}` : `${pad2(day)}/${pad2(monthIndex + 1)}`;

function parseCurrent(value: string, includeYear: boolean): Date | null {
  if (!value.trim()) return null;
  if (includeYear) {
    const iso = dateInput(value);
    return iso ? parseDate(iso) : null;
  }
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(2026, +m[2] - 1, +m[1], 12);
  return d.getMonth() === +m[2] - 1 && d.getDate() === +m[1] ? d : null;
}

export function formatPickedDate(value: string, includeYear = true): string {
  const date = parseCurrent(value, includeYear);
  if (!date) return '';
  return includeYear
    ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

type DatePickerFieldProps = {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minDateValue?: string;
  includeYear?: boolean;
  style?: any;
};

export function DatePickerField({
  label,
  value,
  onChange,
  placeholder = 'Select a date',
  minDateValue,
  includeYear = true,
  style,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [pickingYear, setPickingYear] = useState(false);

  const selectedDate = useMemo(() => parseCurrent(value, includeYear), [value, includeYear]);
  const minDate = useMemo(() => (minDateValue ? parseCurrent(minDateValue, includeYear) : null), [minDateValue, includeYear]);

  const initialCursor = selectedDate ?? minDate ?? new Date();
  const [viewYear, setViewYear] = useState(initialCursor.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialCursor.getMonth());

  const openPicker = () => {
    Keyboard.dismiss();
    const base = selectedDate ?? minDate ?? new Date();
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setPickingYear(false);
    setOpen(true);
  };

  const stepMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1, 12);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const cells = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1, 12);
    const startOffset = (first.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0, 12).getDate();
    const grid: (number | null)[] = Array.from({ length: startOffset }, () => null);
    for (let d = 1; d <= daysInMonth; d += 1) grid.push(d);
    while (grid.length % 7 !== 0) grid.push(null);
    return grid;
  }, [viewYear, viewMonth]);

  const today = new Date();
  const display = formatPickedDate(value, includeYear);
  const yearRange = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 16 }, (_, i) => currentYear - 5 + i);
  }, []);

  const isDisabledDay = (day: number) => {
    if (!minDate || !includeYear) return false;
    const candidate = new Date(viewYear, viewMonth, day, 12);
    return candidate.getTime() < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate(), 12).getTime();
  };

  const isSelectedDay = (day: number) => {
    if (!selectedDate) return false;
    const sameDayMonth = selectedDate.getDate() === day && selectedDate.getMonth() === viewMonth;
    return includeYear ? sameDayMonth && selectedDate.getFullYear() === viewYear : sameDayMonth;
  };

  const isToday = (day: number) =>
    includeYear && today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;

  return (
    <View style={[styles.wrap, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputRow}>
        <Pressable onPress={openPicker} accessibilityRole="button" accessibilityLabel={label || placeholder} style={styles.trigger}>
          <Icon name="calendar" size={18} color={display ? C.green : C.grey} />
          <Text style={[styles.triggerText, !display && styles.placeholder]} numberOfLines={1}>
            {display || placeholder}
          </Text>
          {!display ? <Icon name="forward" size={16} color={C.grey} /> : null}
        </Pressable>
        {display ? (
          <Pressable
            onPress={() => onChange('')}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label ?? 'date'}`}
            hitSlop={8}
            style={styles.clearBtn}
          >
            <Icon name="close" size={15} color={C.grey} />
          </Pressable>
        ) : null}
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetTop}>
              <Text style={styles.sheetTitle}>{label || 'Choose date'}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="Close date picker">
                <Icon name="close" size={20} color={C.ink} />
              </Pressable>
            </View>

            <View style={styles.monthBar}>
              <Pressable onPress={() => stepMonth(-1)} style={styles.navBtn} accessibilityLabel="Previous month">
                <Icon name="back" size={18} color={C.navy} />
              </Pressable>
              <Pressable
                onPress={() => includeYear && setPickingYear(v => !v)}
                style={styles.monthChip}
                accessibilityRole={includeYear ? 'button' : undefined}
              >
                <Text style={styles.monthLabel}>
                  {includeYear ? `${MONTHS[viewMonth]} ${viewYear}` : MONTHS[viewMonth]}
                </Text>
              </Pressable>
              <Pressable onPress={() => stepMonth(1)} style={styles.navBtn} accessibilityLabel="Next month">
                <Icon name="forward" size={18} color={C.navy} />
              </Pressable>
            </View>

            {pickingYear && includeYear ? (
              <ScrollView style={{ maxHeight: 230 }} contentContainerStyle={styles.yearGrid}>
                {yearRange.map(yr => {
                  const active = yr === viewYear;
                  return (
                    <Pressable
                      key={yr}
                      onPress={() => { setViewYear(yr); setPickingYear(false); }}
                      style={[styles.yearCell, active && styles.yearCellOn]}
                    >
                      <Text style={[styles.yearText, active && styles.yearTextOn]}>{yr}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <>
                <View style={styles.weekRow}>
                  {WEEKDAYS.map(w => <Text key={w} style={styles.weekLabel}>{w}</Text>)}
                </View>
                <View style={styles.daysGrid}>
                  {cells.map((day, idx) => {
                    if (day == null) return <View key={`e-${idx}`} style={styles.dayCell} />;
                    const disabled = isDisabledDay(day);
                    const selected = isSelectedDay(day);
                    const current = isToday(day);
                    return (
                      <Pressable
                        key={`${viewMonth}-${day}`}
                        disabled={disabled}
                        onPress={() => {
                          onChange(toValue(viewYear, viewMonth, day, includeYear));
                          setOpen(false);
                        }}
                        style={styles.dayCell}
                      >
                        <View style={[
                          styles.dayCircle,
                          current && !selected && styles.dayToday,
                          selected && styles.daySelected,
                        ]}>
                          <Text style={[
                            styles.dayNum,
                            disabled && styles.dayDisabled,
                            selected && styles.daySelectedNum,
                          ]}>
                            {day}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            <View style={styles.sheetFooter}>
              {value ? (
                <Pressable onPress={() => { onChange(''); setOpen(false); }} style={styles.footerBtn}>
                  <Text style={styles.footerLinkMuted}>Clear date</Text>
                </Pressable>
              ) : <View />}
              {includeYear ? (
                <Pressable
                  onPress={() => {
                    const now = new Date();
                    const picked = minDate && now.getTime() < minDate.getTime() ? minDate : now;
                    onChange(toValue(picked.getFullYear(), picked.getMonth(), picked.getDate(), true));
                    setOpen(false);
                  }}
                  style={styles.footerBtn}
                >
                  <Text style={styles.footerLink}>Today</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontSize: 13.5, color: C.navy, fontFamily: F.sansMedium, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line },
  trigger: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13 },
  triggerText: { flex: 1, fontSize: 15.5, color: C.ink, fontFamily: F.sans },
  placeholder: { color: C.faint },
  clearBtn: { paddingHorizontal: 12, paddingVertical: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(18, 28, 22, 0.45)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: C.cream, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: C.line },
  sheetTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontFamily: F.serif, fontSize: 21, color: C.navy },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  monthChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: C.greenSoft },
  monthLabel: { fontFamily: F.sansBold, fontSize: 14.5, color: C.green },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekLabel: { width: '14.285%', textAlign: 'center', fontFamily: F.sansMedium, fontSize: 12, color: C.grey },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.285%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayToday: { borderWidth: 1.5, borderColor: C.green },
  daySelected: { backgroundColor: C.green },
  dayNum: { fontFamily: F.sansMedium, fontSize: 14, color: C.navy },
  dayDisabled: { color: C.faint, opacity: 0.45 },
  daySelectedNum: { color: '#FFF', fontFamily: F.sansBold },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 6, justifyContent: 'center' },
  yearCell: { width: '29%', paddingVertical: 10, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center' },
  yearCellOn: { backgroundColor: C.green, borderColor: C.green },
  yearText: { fontFamily: F.sansMedium, fontSize: 14.5, color: C.navy },
  yearTextOn: { color: '#FFF', fontFamily: F.sansBold },
  sheetFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderColor: C.line },
  footerBtn: { paddingVertical: 4, paddingHorizontal: 6 },
  footerLink: { fontFamily: F.sansBold, fontSize: 14, color: C.green },
  footerLinkMuted: { fontFamily: F.sansMedium, fontSize: 14, color: C.grey },
});
