import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { C, F, S } from '@/lib/theme';
import { Alert } from '@/lib/alert';
import { STORY_CATEGORIES, saveStoryPreference, type StoryPreference, type StoryWithPreference } from '@/lib/story-preferences';
import { Btn, Chip, Small, st } from './ui';
import { Icon } from './icon';

/** The "•••" sheet on a story row: favourite, category and the person's own tags. */
export function StoryActionsSheet({ story, userId, onClose, onChanged }: { story: StoryWithPreference; userId: string; onClose: () => void; onChanged: () => Promise<void> | void }) {
  const [newTag, setNewTag] = useState('');
  const [busy, setBusy] = useState(false);
  const tags = story.tags ?? [];

  const save = async (patch: StoryPreference) => {
    if (busy) return;
    setBusy(true);
    try { await saveStoryPreference(userId, story.id, patch); await onChanged(); }
    catch (e) { Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  };
  const addTag = () => {
    const tag = newTag.trim();
    if (!tag) return;
    setNewTag('');
    void save({ tags: [...tags, tag] });
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.title} numberOfLines={2}>{story.title}</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: !!story.favourite }} disabled={busy} onPress={() => { void save({ favourite: !story.favourite }); }} style={styles.action}>
            <Icon name="star" size={20} color={story.favourite ? '#D2382B' : C.ink} />
            <Text style={styles.actionText}>{story.favourite ? 'Remove from Favourites' : 'Add to Favourites'}</Text>
          </Pressable>
          <Text style={styles.label}>Category</Text>
          <View style={styles.wrap}>
            {STORY_CATEGORIES.map(category => <Chip key={category} label={category} on={story.category === category} onPress={() => { void save({ category }); }} />)}
          </View>
          <Text style={styles.label}>Your tags</Text>
          <View style={styles.wrap}>
            {tags.map(tag => <Pressable key={tag} accessibilityRole="button" accessibilityLabel={'Remove tag ' + tag} disabled={busy} onPress={() => { void save({ tags: tags.filter(t => t !== tag) }); }} style={[st.chip, st.chipWithIcon]}>
              <Text style={st.chipText}>{tag}</Text><Icon name="close" size={14} color={C.grey} />
            </Pressable>)}
          </View>
          {tags.length < 5 ? <View style={styles.addRow}>
            <TextInput value={newTag} onChangeText={setNewTag} onSubmitEditing={addTag} placeholder="Add a tag, like Baking" placeholderTextColor={C.faint} maxLength={24} returnKeyType="done" style={[st.input, { flex: 1 }]} />
            <Btn title="Add" kind="outline" disabled={busy || !newTag.trim()} onPress={addTag} />
          </View> : <Small>You can have up to 5 tags on a story. Tap one to remove it.</Small>}
          <Btn title="Open story" onPress={() => { onClose(); router.push(`/story/${story.id}`); }} style={{ marginTop: 12 }} />
          <Btn title="Close" kind="link" onPress={onClose} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0006' },
  sheet: { maxHeight: '82%', backgroundColor: C.cream, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: S.pad, paddingTop: 10, paddingBottom: 24 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#D8D2C6', alignSelf: 'center', marginBottom: 12 },
  title: { fontFamily: F.serif, fontSize: 22, color: C.navy, marginBottom: 6 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46 },
  actionText: { fontFamily: F.sansMedium, fontSize: 15, color: C.ink },
  label: { fontFamily: F.sansBold, fontSize: 13, color: C.ink, marginTop: 8, marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
