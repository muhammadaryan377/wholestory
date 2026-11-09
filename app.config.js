// Expo SDK 58: associate the *same* public invite origin with both native apps.
// Set EXPO_PUBLIC_INVITE_BASE_URL in the EAS build environment, and deploy
// the matching AASA and assetlinks files to that exact host.

// Google Maps on Android crashes without a key, so the map screen reads
// extra.androidMapsEnabled and only draws the map when this build has one.
function withAndroidMaps(config) {
  const key = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  return {
    ...config,
    extra: { ...config.extra, androidMapsEnabled: !!key },
    plugins: key
      ? [...(config.plugins ?? []), ['react-native-maps', { androidGoogleMapsApiKey: key }]]
      : config.plugins,
  };
}

module.exports = ({ config }) => {
  const raw = process.env.EXPO_PUBLIC_INVITE_BASE_URL;
  if (!raw) return withAndroidMaps(config);

  let url;
  try { url = new URL(raw); }
  catch { throw new Error('EXPO_PUBLIC_INVITE_BASE_URL must be a valid HTTPS domain.'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
      (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new Error('EXPO_PUBLIC_INVITE_BASE_URL must be a clean HTTPS origin, for example https://your-verified-site.com');
  }
  const host = url.hostname;
  const ios = config.ios ?? {};
  const android = config.android ?? {};
  const intent = {
    action: 'VIEW',
    autoVerify: true,
    category: ['BROWSABLE', 'DEFAULT'],
    data: [{ scheme: 'https', host, pathPrefix: '/join/' }],
  };
  return withAndroidMaps({
    ...config,
    ios: {
      ...ios,
      associatedDomains: [...new Set([...(ios.associatedDomains ?? []), 'applinks:' + host])],
    },
    android: {
      ...android,
      intentFilters: [...(android.intentFilters ?? []), intent],
    },
  });
};
