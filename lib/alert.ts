import { Alert as NativeAlert, Platform, type AlertButton } from 'react-native';

/** Turns transport and database wording into something a person can act on. */
export function friendlyMessage(message: string | undefined, fallback = 'Please try again.') {
  if (!message) return fallback;
  if (/network request failed|failed to fetch|load failed|timed? ?out/i.test(message)) return 'Check your internet connection and try again.';
  if (/PGRST116|coerce the result|JSON object requested/i.test(message)) return 'This is no longer available. It may have been removed, or you may not have access.';
  return message;
}

export type Dialog = { title: string; message?: string; buttons: AlertButton[]; input?: { value: string; secure: boolean; submit: (value: string) => void } };
let current: Dialog | null = null;
const listeners = new Set<() => void>();
const queue: Dialog[] = [];
export const getDialog = () => current;
export function subscribeDialog(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function show(dialog: Dialog) {
  if (current) queue.push(dialog); else current = dialog;
  listeners.forEach(listener => listener());
}
export function dismissDialog() {
  current = queue.shift() ?? null;
  listeners.forEach(listener => listener());
}
export function executeDialogAction(action?: () => unknown) {
  try { Promise.resolve(action?.()).catch(error => Alert.alert('Could not complete', friendlyMessage(error?.message))); }
  catch (error) { Alert.alert('Could not complete', friendlyMessage(error instanceof Error ? error.message : undefined)); }
}
export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    if (Platform.OS === 'ios') return NativeAlert.alert(title, message, buttons?.map(button => ({ ...button, onPress: () => executeDialogAction(() => button.onPress?.()) })));
    show({ title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] });
  },
  prompt(title: string, message: string, submit: (value: string) => void, type = 'plain-text', defaultValue = '') {
    if (Platform.OS === 'ios') return NativeAlert.prompt(title, message, value => executeDialogAction(() => submit(value)), type as 'plain-text', defaultValue);
    show({ title, message, buttons: [{ text: 'Cancel', style: 'cancel' }, { text: 'Save' }], input: { value: defaultValue, secure: type === 'secure-text', submit } });
  },
};
