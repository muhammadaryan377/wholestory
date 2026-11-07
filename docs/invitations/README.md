# Whole Stories invitation links

How a story invitation travels from the owner to a friend, what the code does, and what **you still have to set up
outside the code** before the links work for real people.

## How it works

1. **Owner taps Invite** on a story. The app asks Supabase for the story's invite code and builds one HTTPS link:
   `https://YOUR_DOMAIN/join/CODE` (`lib/invite-links.ts`). `YOUR_DOMAIN` comes from `EXPO_PUBLIC_INVITE_BASE_URL`.
2. **Share** opens the phone's own share sheet (`lib/invite-actions.ts`), so WhatsApp, SMS/iMessage, email, Telegram and
   the rest all get the same text with the link on its own last line, which makes it clickable everywhere. Desktop web
   uses the browser share sheet, or copies the invitation if the browser has none. **Copy link** copies just the URL.
3. **The friend taps the link.**
   - App installed and the domain is verified: the link opens the app straight on `/join/CODE` (Universal Links on iOS,
     verified App Links on Android).
   - App not installed, or the link opened in a browser: the website serves the web invitation page
     (`app/join/[code].tsx` on web) with **Log in to join**, **Create an account**, **Open in the Whole Stories app**
     (`wholestory://join/CODE`) and, once configured, **App Store / Google Play** buttons.
4. **Login or signup.** Before sending the person to log in, the page saves the code on the device
   (`lib/pending-invite.ts`, kept for 14 days). Login, signup (including new-account setup), Apple/Google sign-in and
   email confirmation all end at the home route `/`, which resumes the saved invitation (`app/index.tsx`).
5. **Join.** `join_story(code)` in the database adds the person to the correct story as a contributor, and the app opens it.
   - Success: the saved invitation is removed.
   - Invalid, expired or private-story invitation: the person sees a clear message and the saved invitation is removed.
   - No internet or a login hiccup: the saved invitation is **kept** and **Try again** is offered.

## What changed in this branch

- `lib/invite-links.ts`: `parseInviteLink` (only trusts the configured website, the app scheme and `/join/CODE`),
  `openInAppUrl`, `appStoreLinks`.
- `lib/invite-flow.ts`: classifies join errors (invalid / expired / private / login / network) and `completeInvite`, which
  decides whether the saved invitation is removed or kept.
- `lib/invite-actions.ts`: share outcome (`shared` / `dismissed` / `copied`) and a web fallback.
- `app/join/[code].tsx`: separate messages per failure, store buttons, and the invitation is no longer lost on a network error.
- `supabase/migrations/20261107_story_invite_expiry.sql`: invitations created from now on expire after 30 days; existing
  invitations keep working; `join_story` answers "not valid" and "has expired" separately.
- `scripts/invite-association.cjs`: builds and validates the Apple and Google association files and checks the live website.
- Tests: `scripts/test-invites.cjs` (Node) and `supabase/tests/join_story*.sql` (real PostgreSQL).

## Deployment configuration still required (cannot be done in code)

Nothing below is guessed or filled in for you. Until these are done, **Share and Copy link show a clear
"invitation links are not configured" message** and no Universal/App Link is built into the apps.

| # | What | Where it comes from |
|---|------|---------------------|
| 1 | **A website domain you control** that will serve `https://DOMAIN/join/CODE` | Your domain/hosting. `wholestory.app` currently shows a marketing site, not a join page. |
| 2 | **Host the web build** on that domain: `npx expo export --platform web`, then serve `dist/`. The host must answer **every** `/join/*` URL with the app's `index.html` (single-page rewrite) and return HTTP 200. | Your hosting provider's rewrite setting |
| 3 | **Apple Team ID** (10 characters) | developer.apple.com > Account > Membership details |
| 4 | **Android signing certificate SHA-256 fingerprint(s)** of the build users install (the Play app-signing key, plus the upload/EAS key for test builds) | Google Play Console > Setup > App signing, and `npx eas-cli credentials` |
| 5 | **Generate the two association files** from #3 and #4 (command below) and serve them at `https://DOMAIN/.well-known/apple-app-site-association` (no file extension) and `https://DOMAIN/.well-known/assetlinks.json`: HTTPS, **no redirects**, JSON | Your hosting provider |
| 6 | **Set `EXPO_PUBLIC_INVITE_BASE_URL=https://DOMAIN`** in the local `.env` **and** in the EAS build environment, then **rebuild both apps**. `app.config.js` adds the iOS associated domain and the Android verified intent filter from it. Set it only after #1, #2 and #5 are live | EAS environment variables |
| 7 | `EXPO_PUBLIC_IOS_APP_STORE_URL` and `EXPO_PUBLIC_ANDROID_PLAY_STORE_URL` (optional): shown as buttons on the web page | Your public store pages, once the apps are published |
| 8 | **Run the database migration** `supabase/migrations/20261107_story_invite_expiry.sql` in Supabase **before** releasing this app version | Supabase SQL editor or `supabase db push` |
| 9 | Make sure the bundle ID `app.wholestory.ios` and package `app.wholestory.android` belong to **your** Apple/Google developer accounts | Apple/Google consoles |

### Commands

```bash
# 1. Create the association files (refuses to run without real values)
APPLE_TEAM_ID=YOURTEAMID ANDROID_SHA256_FINGERPRINTS="AA:BB:...:FF" node scripts/invite-association.cjs generate
#    writes public/.well-known/apple-app-site-association and assetlinks.json
#    (Expo copies the public/ folder into the web build, so they deploy with it)

# 2. Check the app configuration and the generated files
EXPO_PUBLIC_INVITE_BASE_URL=https://DOMAIN node scripts/invite-association.cjs validate

# 3. After deploying, check the live website (association files, no redirects, /join page answers 200)
EXPO_PUBLIC_INVITE_BASE_URL=https://DOMAIN node scripts/invite-association.cjs validate --online --strict
```

Serve `apple-app-site-association` with `Content-Type: application/json`. Static hosts often send extensionless files as
`application/octet-stream`; the check warns about this.

`docs/invitations/*.example.json` show the file formats with obvious `REPLACE_WITH_...` placeholders. Do not deploy the
examples.

## What has and has not been verified

Verified by tests in this repository (Node, plus a throw-away local PostgreSQL 18 with minimal stand-ins for Supabase):
- link building and parsing, share-sheet content, web share fallback
- successful, invalid, expired, private and network-failure join outcomes, and when the saved invitation is kept or removed
- the saved invitation surviving login/signup, and expiring after 14 days
- the SQL function itself: success, invalid, expired, private story, signed out, default 30-day expiry, permissions
- `app.config.js` producing the iOS associated domain and Android verified link for a test host
- association file generation and validation, including refusing placeholders and made-up values
- the web invitation page in a desktop browser (valid link, invalid link, saved invitation, store buttons)

**Not verified (needs real devices, a real domain and real accounts):**
- Universal Links and App Links actually opening the app on iOS and Android
- WhatsApp, iMessage/SMS, Mail and Telegram rendering and tapping the link
- the shared link reaching the app after a fresh install, and email-confirmation sign-ups on a phone
- the real Supabase project (the migration has not been applied there)

Device checklist once deployed: WhatsApp, SMS/iMessage, Mail, Telegram, Copy link; app installed / not installed; logged in /
logged out / new account; email confirmation; invalid link; expired invitation; airplane mode during join.

## Notes

- Custom-scheme links (`wholestory://`) are never shared publicly; they only power the "Open in the app" button.
- After a fresh install, iOS and Android do not carry the link through the store. People who installed from the store
  open the original link again. Deferred deep links would need a separate service.
- Documentation: https://docs.expo.dev/linking/ios-universal-links/ and https://docs.expo.dev/linking/android-app-links/
