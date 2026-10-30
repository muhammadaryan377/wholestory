import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { addComment, deleteComment, type Comment } from '@/lib/api';
import { C, F } from '@/lib/theme';
import { Small } from './ui';

/** Comments under a story entry or an event post, with a box to add one. */
export function Comments({ items, target, uid, canModerate, onChange }: { items: Comment[]; target: { entry_id?: string; post_id?: string }; uid: string | null; canModerate: boolean; onChange: () => void }) {
  const [text, setText] = useState(''); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); try { await addComment(target, text); setText(''); onChange(); } catch (e: any) { Alert.alert('Could not post', e.message ?? ''); } finally { setBusy(false); }
  };
  const remove = (c: Comment) => Alert.alert('Delete this comment?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await deleteComment(c.id); onChange(); } }]);
  const shown = open ? items : items.slice(-2);
  return (
    <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 }}>
      {items.length > 2 && !open ? <Pressable onPress={() => setOpen(true)}><Small style={{ color: C.green, marginBottom: 4 }}>View all {items.length} comments</Small></Pressable> : null}
      {shown.map(c => (
        <View key={c.id} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
          <Text style={{ flex: 1, fontFamily: F.sans, fontSize: 14, color: C.ink, lineHeight: 19 }}>
            <Text style={{ fontFamily: F.sansBold }}>{c.author_user === uid ? 'You' : c.author_name || c.guest_name || 'Someone'} </Text>{c.text}
          </Text>
          {c.author_user === uid || canModerate ? <Pressable onPress={() => remove(c)} hitSlop={8} accessibilityLabel="Delete comment"><Text style={{ color: C.faint, fontSize: 12, marginLeft: 8 }}>Delete</Text></Pressable> : null}
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput value={text} onChangeText={setText} placeholder="Add a comment…" placeholderTextColor={C.faint} onSubmitEditing={send} returnKeyType="send"
          style={{ flex: 1, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E0D9CD', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, fontFamily: F.sans, fontSize: 14, color: C.ink }} />
        <Pressable onPress={send} hitSlop={8} accessibilityLabel="Post comment"><Text style={{ fontFamily: F.sansBold, color: text.trim() ? C.green : C.faint }}>Post</Text></Pressable>
      </View>
    </View>
  );
}
