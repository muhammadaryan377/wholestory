import { useFocusResource } from '@/lib/use-focus-resource';

import { Pressable, View } from 'react-native';
import { useMobileLayout } from '@/lib/use-mobile-layout';

import { LoadError, Screen, H1, P, Small, Empty, Loading } from '@/components/ui';
import { Photo } from '@/components/media';
import { listFavourites } from '@/lib/api';
import { openPhoto } from '@/lib/open';

export default function Favourites() {
  const { data: items, error, reload } = useFocusResource(listFavourites);
  const { contentWidth } = useMobileLayout(); const size = Math.floor((contentWidth - 12) / 3);

  if (error) return <LoadError error={error} onRetry={reload} />;
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
