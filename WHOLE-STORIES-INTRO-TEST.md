# Whole Stories intro: swipe-test branch

This branch adds five swipeable introduction pages before sign-up. The existing Expo splash screen is unchanged, and the existing authenticated profile onboarding (`app/onboarding.tsx`) is preserved.

## Behavior
- New signed-out installation: introductory pages, then sign-up.
- Swipe horizontally, tap Next or Back, or tap progress dots.
- Skip and Get started mark the introduction seen in AsyncStorage.
- Already have an account links to sign-in.
- Returning signed-out installation goes to sign-in; logged-in installations go home.
- Internal anonymous-auth preview builds retain their guest sign-in behavior.

## Images: preview-only
The image URIs in `app/welcome.tsx` are **temporary remote preview photos**. They are not the approved final image assets. Before release, copy the separately prepared real photos into `assets/onboarding/`, replace each network URI with static `require('../assets/onboarding/name.jpg')` references, and test offline loading.

## Test checklist
1. Pull this branch and start your Expo development build.
2. On a clean app storage install, verify every page, all Next/Back controls, dot navigation, and swipes in both directions.
3. Check Skip, Get started and Log in routes.
4. Restart after skipping: intro should not repeat.
5. Verify existing authenticated users open Home directly and sign-up still reaches existing profile setup.
6. Test iPhone small/large screens, accessibility tap targets, offline images after final asset bundling.

This branch has not been device-tested in ChatGPT. Do not merge until assets are bundled and acceptance testing passes.
