# Whole Stories — iOS code & typography review

Reviewed branch: `feature/whole-stories-intro-swipe`
Do not merge until TestFlight / real-iPhone acceptance testing.

## Font and visual system
- Headings/story names: Newsreader SemiBold/Regular via shared `F.serif`.
- Labels, input, paragraphs, buttons: Inter Regular/Medium/SemiBold via shared `F.sans`.
- Shared `Btn` and `Chip` use consistent minimum sizes and design tokens.
- App display name, iOS permission descriptions and visible labels consistently say `Whole Stories` (underlying app IDs, URI scheme, and production domains remain unchanged).
- Root layout preloads both fonts before showing the interface.
- Icons and emojis may use native glyph fallback; these are not prose typography.

## iOS reliability fixes included in this review
- Returning signed-out user navigates to root auth routing instead of being forced back through intro.
- Profile avatar update refreshes in Today and Settings, with safe file replacement and rollback if a local copy fails.
- Private keypad handles rapid consecutive taps from a ref and secure PIN load failures now offer Retry rather than hanging.
- Face ID unlock awaits the result and relocks if fetching private stories fails.
- Map header navigation scrolls horizontally on small iPhones; selected-story bottom card respects the home-indicator safe area.
- Android/web functionality preserved to the extent static TypeScript/lint checks can verify.

## Static automated checks
GitHub Actions runs `npm ci`, `npx expo config --type public --json`, `npx tsc --noEmit`, `npm run lint`, and `node scripts/test-regressions.cjs`.
New regression asserts app title, font registration, button typography, opt-in location settings and returning login routing.

## Approved image integration (Nov 7)
- Intro: couple, dog, timeline, voice and community assets are bundled and rendered in `app/welcome.tsx`.
- Account setup: Photos and Plan steps use locally bundled approved collage assets; moment groups still use users' real library photos.
- Home: if no real cover photo is available, an explicitly labelled example photograph invites story creation. Real photo covers take precedence.
- Existing signed-in users can replay the new introduction through **Settings → View introduction** without returning to signup.
- Web bundle is checked by CI using `npx expo export --platform web`.

## Manual iPhone tests still mandatory
1. Install a fresh iOS preview/development build with expo-location compiled in; verify app startup, splash and Newsreader/Inter glyph rendering.
2. Test on small and large iPhones, notch/home indicator, normal and Large Text accessibility sizes, light theme, keyboard open, screen rotation locked portrait.
3. First launch: slide each intro page left/right and by pagination dots, Back, Next, Skip, Get started; verify signed-out return does not replay intro.
4. Account: email confirmation, Apple Sign In, Google Sign In, password reset, relaunch, logout/login; verify profile setup is shown only when appropriate.
5. Profile: add, replace, remove photo on Home and Settings; deny photo picker; kill/restart app; switch accounts; no other account avatar should show.
6. Photos: limited and full library access, empty albums, 300+ photos, generated date group names and manual group editing.
7. Stories: create, save, reopen, rename, comment, favourites, attach voice, share, member invitation and revoked/invalid join link.
8. Map: photo GPS pin, optional current-location permission (Allow Once, Deny, restricted), manual map tap, remove location and no background tracking.
9. Private: set PIN, fast taps, delete/clear, wrong PIN, Face ID, PIN reset, relock when backgrounded and account switching.
10. Events: create wall, QR/link sharing, guest access, voice/photo contributions, scheduling and delete.
11. Verify subscriptions only after enabling and configuring live RevenueCat/App Store products in a dedicated sandbox build.

## Known release blockers / limits
- Five approved onboarding illustration photos and the Photos/Plan collages are now bundled locally under `assets/onboarding/`; no external stock-photo request is needed for these screens.
- Invites require a verified public HTTPS /join route and Apple AASA/Android association files; without that configuration sharing intentionally fails with an explicit error.
- User-assigned categories and manual story map positions live on this device; cross-device synchronization needs server-backed implementation. Profile avatars are saved privately to the account.
- Individual Voice note Favourites saving isn't implemented; that filter displays an honest unavailable message.
- Payment plans/trial are disabled in this test build; no fake billing or test charge claims.
- GitHub Actions are static/regression tests; no native iPhone execution or TestFlight sign-off has occurred.
