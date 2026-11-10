
import { useState } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  addComment,
  deleteComment,
  type Comment,
} from '@/lib/api';

import { C, F } from '@/lib/theme';
import { Small } from './ui';

export function Comments({
  items,
  target,
  uid,
  canModerate,
  onChange,
}: {
  items: Comment[];
  target: { entry_id?: string; post_id?: string };
  uid: string | null;
  canModerate: boolean;
  onChange: () => void | Promise<void>;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const send = async () => {
    if (!text.trim() || busy) return;

    setBusy(true);
    setError('');

    try {
      await addComment(target, text.trim());
      setText('');
      await onChange();
    } catch (e: any) {
      setError(e?.message ?? 'Could not post comment.');
    } finally {
      setBusy(false);
    }
  };

  const performDelete = async (c: Comment) => {
    if (deletingId) return;

    if (c.author_user !== uid && !canModerate) {
      setError('You cannot delete this comment.');
      return;
    }

    setDeletingId(c.id);
    setError('');

    try {
      await deleteComment(c.id);
      setConfirmingId(null);
      await onChange();
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete comment.');
    } finally {
      setDeletingId(null);
    }
  };

  const shown = open ? items : items.slice(-2);

  return (
    <View
      style={{
        marginTop: 10,
        borderTopWidth: 1,
        borderTopColor: C.line,
        paddingTop: 8,
      }}
    >
      {items.length > 2 && !open ? (
        <Pressable onPress={() => setOpen(true)}>
          <Small
            style={{
              color: C.green,
              marginBottom: 6,
            }}
          >
            View all {items.length} comments
          </Small>
        </Pressable>
      ) : null}

      {shown.map((c) => {
        const canDelete =
          (!!uid && c.author_user === uid) || canModerate;

        const confirming = confirmingId === c.id;
        const isDeleting = deletingId === c.id;

        return (
          <View
            key={c.id}
            style={{
              marginBottom: 10,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
              }}
            >
              <Text
                style={{
                  flex: 1,
                  fontFamily: F.sans,
                  fontSize: 14,
                  color: C.ink,
                  lineHeight: 19,
                }}
              >
                <Text style={{ fontFamily: F.sansBold }}>
                  {c.author_user === uid
                    ? 'You'
                    : c.author_name ||
                      c.guest_name ||
                      'Someone'}{' '}
                </Text>
                {c.text}
              </Text>

              {canDelete && !confirming ? (
                <Pressable
                  onPress={() => {
                    setError('');
                    setConfirmingId(c.id);
                  }}
                  disabled={!!deletingId}
                  accessibilityLabel="Delete comment"
                  hitSlop={8}
                >
                  <Text
                    style={{
                      color: C.faint,
                      fontFamily: F.sansMedium,
                      fontSize: 12,
                      marginLeft: 8,
                    }}
                  >
                    Delete
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {confirming ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 14,
                  marginTop: 8,
                }}
              >
                <Small style={{ color: C.faint }}>
                  Delete this comment?
                </Small>

                <Pressable
                  onPress={() => setConfirmingId(null)}
                  disabled={isDeleting}
                >
                  <Text
                    style={{
                      color: C.ink,
                      fontFamily: F.sansMedium,
                      fontSize: 13,
                    }}
                  >
                    Cancel
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => void performDelete(c)}
                  disabled={isDeleting}
                >
                  <Text
                    style={{
                      color: C.red,
                      fontFamily: F.sansBold,
                      fontSize: 13,
                    }}
                  >
                    {isDeleting ? 'Deleting...' : 'Confirm delete'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}

      {error ? (
        <Text
          accessibilityRole="alert"
          style={{
            color: C.red,
            fontFamily: F.sans,
            fontSize: 13,
            marginBottom: 8,
          }}
        >
          {error}
        </Text>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Add a comment…"
          placeholderTextColor={C.faint}
          onSubmitEditing={send}
          returnKeyType="send"
          editable={!busy}
          style={{
            flex: 1,
            backgroundColor: '#FFF',
            borderWidth: 1,
            borderColor: '#E0D9CD',
            borderRadius: 18,
            paddingHorizontal: 12,
            paddingVertical: 8,
            fontFamily: F.sans,
            fontSize: 14,
            color: C.ink,
          }}
        />

        <Pressable
          onPress={send}
          disabled={busy || !text.trim()}
          hitSlop={8}
          accessibilityLabel="Post comment"
        >
          <Text
            style={{
              fontFamily: F.sansBold,
              color:
                text.trim() && !busy
                  ? C.green
                  : C.faint,
            }}
          >
            {busy ? 'Posting...' : 'Post'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
