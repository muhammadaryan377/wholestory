/** Date-only values are calendar dates, never UTC instants. */
export function parseDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(+match[1], +match[2] - 1, +match[3], 12) : new Date(value);
}
export function localDate(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
export function dateInput(value: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!m || +m[3] < 1900 || +m[3] > 9999) return null;
  const date = new Date(+m[3], +m[2] - 1, +m[1], 12);
  return date.getFullYear() === +m[3] && date.getMonth() === +m[2] - 1 && date.getDate() === +m[1] ? localDate(date) : null;
}
export function validMonthDay(month: number, day: number) {
  const date = new Date(2000, month - 1, day);
  return Number.isInteger(month) && Number.isInteger(day) && date.getMonth() === month - 1 && date.getDate() === day;
}
export function dateRange(a: string | null, b: string | null) {
  const format = (d: string) => parseDate(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return a ? b && b !== a ? `${format(a)} – ${format(b)}` : format(a) : '';
}
