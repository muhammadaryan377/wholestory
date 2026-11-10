# Whole Stories — combined onboarding + privacy keypad test branch

Branch: feature/whole-stories-intro-swipe

This branch is for review and device testing only. Keep main untouched until checks and iPhone testing pass.

## First launch introduction
- Logged-out first launch: an in-app splash (about 2 seconds, or tap) and then 5 swipeable introduction pages: a full-screen hero followed by 4 pages with 4 progress dots.
- Check swipe left/right, Next, Skip, tapping the progress dots, login link and repeated fast taps.
- Voice page ("Try it"): the bottom button starts a recording and then turns into Next. Check mic permission allow/deny, stop, play back (also with the silent switch on), Record again, and swiping or tapping Next while recording. The demo clip stays in the temporary cache only and is never uploaded or saved to an account.
- Intro completion is saved locally, so returning signed-out users go to Login.
- Existing logged-in users open Home when their profile setup is already complete.
- The introduction photos are bundled in `assets/onboarding/` (no internet needed). The photo, voice, timeline and collaboration crops come from the design handoff. The welcome background was reconstructed from the supplied reference to remove baked-in text and buttons; live text and accessible controls are rendered by the app. See `assets/onboarding/README.md` for provenance.
- The introduction uses the reference cream/navy/green palette, a glowing splash, and a centered layout capped at 480 pixels on wider screens. Short viewports can scroll each page vertically while navigation remains visible. Background images have explicit full-container dimensions on web and native.

## New-account four-step setup
1. Profile: name, optional local-only profile photo, interests and Morning Memory preference.
2. Photos: permission disclosure, Allow access or Not now.
3. Moments: actual authorized-gallery count, date/time-based suggested groups, real thumbnails. Tap any group to rename and add/remove photos, create a new group, load more gallery photos, or remove a group. All saved names and asset IDs remain per account **on the device**. There is no AI analysis and **grouping never uploads photos**.
4. Plans: when payments are disabled, show explicit Free Preview plus inactive Yearly/Monthly previews; no fake charges or trial. With payments enabled, display real RevenueCat offerings, the App Store price, purchasing and restore controls. There is no free-plan bypass while the app's existing paid-access gate is active. A free tier and 7-day trial need their own approved billing configuration.

## Check test scenarios
- Clean install, email signup with/without confirmation, Apple and Google first signup.
- Existing user login, logout/login, switching between two accounts on the same phone.
- Full vs limited vs denied Photos permission, empty gallery, 300+ photos, older photos, app resume.
- Generated group names are date/time labels (not invented cities). User renames to e.g. 'Sunday breakfast' and saved title appears in Home/Suggestions.
- Photo selection, group creation, edit, transfer between groups, delete. Verify photos remain in camera roll.
- Close and reopen after setup and after a partial setup. Check names and group associations.
- Check restricted/offline networks, cancellation/failure of purchase, restoration and paywall access guard.
- Check Private album 6-digit keypad including delete (#), clear (*), wrong PIN, Face ID and reset.
- Test small and large iPhones, long names, device text scale and the keyboard showing.
- Run: npm ci; npx tsc --noEmit; npm run lint; node scripts/test-regressions.cjs

The GitHub Actions workflow runs TypeScript, lint and existing regression tests on this branch.
**Do not merge before real-device acceptance testing.** The reconstructed hero should receive visual design approval before release.
