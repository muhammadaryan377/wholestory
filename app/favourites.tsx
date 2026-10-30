import { useCallback, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen, H1, P, Small, Empty, Loading } from '@/components/ui';
import { Photo } from '@/components/media';
import { listFavourites, type FavPhoto } from '@/lib/api';
import { openPhoto } from '@/lib/open';

export default function Favourites() {
  const [items, setItems] = useState<FavPhoto[] | null>(null);
  const { width } = useWindowDimensions(); const size = Math.floor((width - 40 - 12) / 3);
  useFocusEffect(useCallback(() => { listFavourites().then(setItems).catch(() => setItems([])); }, []));
  if (!items) return <Loading />;
  return (
    <Screen>
      <Small>Your life, in stories</Small>
      <H1>Favourites</H1>
      {!items.length ? <Empty title="No favourites yet" body="Open any photo and tap the heart to keep it here." /> : <P muted style={{ marginBottom: 10 }}>{items.length} {items.length === 1 ? 'photo' : 'photos'} you love.</P>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {items.map(f => <Pressable key={f.id} onPress={() => openPhoto(f, f.story_id, f.story_title)}><Photo path={f.path} size={size} /></Pressable>)}
      </View>
    </Screen>
  );
}
