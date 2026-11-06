import { router, type Href } from 'expo-router';

export function backOrReplace(fallback: Href = '/welcome') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

export function openHome(destination?: Href) {
  router.dismissAll();
  router.replace('/(tabs)');
  if (destination) router.push(destination);
}
