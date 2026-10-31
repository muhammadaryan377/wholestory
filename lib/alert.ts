import { Alert as NativeAlert, Platform, type AlertButton } from 'react-native';

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
  try { Promise.resolve(action?.()).catch(error => Alert.alert('Could not complete', error?.message ?? 'Please try again.')); }
  catch (error) { Alert.alert('Could not complete', error instanceof Error ? error.message : 'Please try again.'); }
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
