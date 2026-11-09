import { useState, useSyncExternalStore } from 'react';
import { Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { dismissDialog, executeDialogAction, getDialog, subscribeDialog, type Dialog } from '@/lib/alert';
import { C, F } from '@/lib/theme';
import { Btn } from './ui';

function DialogContent({ dialog }: { dialog: Dialog }) {
  const [value, setValue] = useState(dialog.input?.value ?? '');
  const close = () => {
    const cancel = dialog.buttons.find(button => button.style === 'cancel');
    dismissDialog(); cancel?.onPress?.();
  };
  return <Modal transparent visible animationType="fade" onRequestClose={close}>
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <ScrollView style={{ flexGrow: 0, maxHeight: '85%', width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: C.cream, borderRadius: 16 }} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={{ fontFamily: F.serif, color: C.navy, fontSize: 24, marginBottom: 10 }}>{dialog.title}</Text>
        {dialog.message ? <Text style={{ color: C.ink, fontFamily: F.sans, marginBottom: 12 }}>{dialog.message}</Text> : null}
        {dialog.input ? <TextInput accessibilityLabel={dialog.title} autoFocus value={value} onChangeText={setValue} secureTextEntry={dialog.input.secure} style={{ fontFamily: F.sans, fontSize: 15, color: C.ink, backgroundColor: C.card, padding: 12, borderWidth: 1, borderColor: C.line, borderRadius: 10, marginBottom: 12 }} /> : null}
        {dialog.buttons.map((button, i) => <Btn key={i} title={button.text ?? 'OK'} kind={button.style === 'destructive' ? 'danger' : button.style === 'cancel' ? 'outline' : 'primary'} onPress={() => {
          dismissDialog();
          executeDialogAction(() => dialog.input && button.style !== 'cancel' ? dialog.input.submit(value) : button.onPress?.());
        }} />)}
      </ScrollView>
    </View>
  </Modal>;
}

export function DialogHost() {
  const dialog = useSyncExternalStore(subscribeDialog, getDialog, () => null);
  return dialog ? <DialogContent key={dialog.title + dialog.message} dialog={dialog} /> : null;
}
