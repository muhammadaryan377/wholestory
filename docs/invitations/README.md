# Whole Stories public invitation links — launch checklist

## Implemented in this feature branch
- One consistent HTTPS URL from the configured invite origin: https://YOUR_VERIFIED_HOST/join/ABC123.
- Share and Copy Link use the same URL and a consistent human-readable invitation.
- The existing Supabase invite code and join_story RPC remain authoritative. No client-created invite IDs.
- /join/[code] persists a pending invite through login/signup and resumes after new-account setup.
- Native associated domains and app links are configured by app.config.js from EXPO_PUBLIC_INVITE_BASE_URL during EAS build.

## Website / Apple / Google setup still required
1. Confirm control of the destination domain. wholestory.app currently serves a marketing site, not a verified join route.
2. Serve https://DOMAIN/join/ABC123 on that exact host, with a usable app-open + install fallback for people without the app. The Expo web join route can be deployed with an appropriate rewrite if desired.
3. Deploy apple-app-site-association.example.json as https://DOMAIN/.well-known/apple-app-site-association (no .json extension). Replace REPLACE_WITH_APPLE_TEAM_ID with the actual Apple Team ID; iOS bundle ID is app.wholestory.ios. Serve 200 application/json with no redirect.
4. Deploy assetlinks.example.json as https://DOMAIN/.well-known/assetlinks.json. Replace fingerprint with the release Android signing certificate SHA-256; package ID is app.wholestory.android.
5. Set EXPO_PUBLIC_INVITE_BASE_URL=https://DOMAIN in local .env AND EAS build environment, then rebuild both native apps. Never set it before the public /join route and domain association files are deployed.
6. Set EXPO_PUBLIC_IOS_APP_STORE_URL / EXPO_PUBLIC_ANDROID_PLAY_STORE_URL only after actual public store URLs exist.
7. Test on a real device: WhatsApp, iMessage/SMS, Mail, Telegram, Copy Link, installed/not installed, logged in/out, email confirmation, invalid/expired invite, and offline mode.

## Limitations
- Invite and Copy Link intentionally fail with a descriptive configuration error if EXPO_PUBLIC_INVITE_BASE_URL is absent. Old custom-scheme links are never sent publicly.
- Messaging platforms determine their own rich previews and clickable-text handling.
- Website hosting, AASA and assetlinks verification, signing details, and real-device QA cannot be completed via app code alone.
- Documentation: https://docs.expo.dev/linking/ios-universal-links/ and https://docs.expo.dev/linking/android-app-links/
