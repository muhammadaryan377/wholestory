# Wholestory – test app for TestFlight

This folder is the real Wholestory app for iPhone (and later Android), built with Expo (React Native) and Supabase.
It is the version for your 2-week test. Payments are switched off in this build so testers can use everything.

## What's in this test build

- Welcome and intro screens, create account, log in, reset password
- Today: greeting, "What made today special?" quick voice story, This day last year, continue your story
- Stories: create a story from your photos (or the camera), tell it by voice or in writing, add to it over time,
  search, invite someone to add their side, hide from memories, rename, delete; delete any photo, recording or entry
- Events wall: create a wall with moments, QR code and link, guests add photos, voice and words from their phone's
  browser with no app, host approval, close the wall, guests see everyone's or only their own, delete anything
- Settings: name, Hard memories, privacy and terms links, feedback by email, log out, delete account
- Suggested stories: with full photo access, the app groups your last two years of photos into days and trips
  worth telling, on the phone. Tell this story, Keep, or Not now
- Speech-to-text: voice stories are turned into words on the phone (no audio leaves it for this); the words can be
  edited before saving and shown under each voice story
- People Pages: add people, tag them in stories, and each person gets a page of your stories together
- Private albums: stories behind a 6-digit passcode or Face ID, never shown in memories, the map or reminders
- Map: stories placed by the location saved in their photos (Apple Maps)
- Notifications: This day last year on anniversaries, an optional evening prompt, and alerts when someone adds to
  your story or a guest adds to your wall
- Download everything: all your stories, photos, recordings and event walls in one file; hosts can download a wall
- Payments: the code is in but switched off for the test (see "Turning on payments")

- Comments on story entries and on event wall posts (guests can comment from the web page too)
- Event walls: cover photo, moments with times (a schedule), the wall grouped by moment, guests choose a moment,
  link expiry and "Make a new link"
- Tell the whole story: choose photos, talk once, and each part is pinned to its photo as a caption
- Favourites: open any photo full screen and tap the heart; Favourites shows them all
- Richer People Pages: cover photo, firsts and milestones, our memories, hide a person from memories
- Hard memories for people and dates as well as stories
- Sign-up steps: interests and morning memory, photo access with "We found N photos", then the plan (when payments are on)
- The raised green + button in the tab bar

Not in this build: face matching (needs specialist work and a privacy assessment first).

## What you need (all free except Apple)

| Account | Why | Cost |
| --- | --- | --- |
| Apple Developer Program (developer.apple.com/programs) | Required for TestFlight | $99 a year |
| Expo (expo.dev) | Builds the iPhone app in the cloud, so you don't need a Mac | Free |
| Supabase (supabase.com) | Stores accounts, stories, photos and recordings | Free to start |
| Netlify (netlify.com) | Hosts the guest web page for event walls | Free |

You also need a computer with Node.js (nodejs.org, the "LTS" version) for the build commands.

## Step 1 – Set up the server (Supabase), about 10 minutes

1. Create a new Supabase project. Choose the London region if offered.
2. Open **SQL editor → New query**, paste everything from `supabase/schema.sql`, and press **Run**.
3. For testing, open **Authentication → Sign In / Providers → Email** and turn off **Confirm email** so testers can
   sign up instantly. (Turn it back on before a public launch.)
4. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key.

## Step 2 – Put your details into the app

1. In `eas.json`, replace the placeholders under `production` → `env` with your Project URL, anon key,
   your support email, and (after step 3) the guest page address.
2. For running on your computer, also copy `.env.example` to `.env` and fill in the same values.

The anon key is designed to be public. Your data is protected by the privacy rules in `schema.sql`.

## Step 3 – Put the guest page online (Netlify), about 5 minutes

1. Open `guest-web/index.html` in a text editor and fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY` near the bottom.
2. Go to app.netlify.com/drop and drag the whole `guest-web` folder onto the page.
3. Copy the site address it gives you (for example `https://wholestory-guests.netlify.app`) into
   `EXPO_PUBLIC_GUEST_PAGE_URL` in `eas.json`. Every event's QR code will point there.

Step 1 also switches on notifications from other people: the script turns on Supabase's `pg_net` extension so the
database can send them. If the script reports an error about `pg_net`, open **Database → Extensions**, turn on
`pg_net`, and run the script again.

## Step 4 – Build the iPhone app, about 30 minutes (mostly waiting)

Open Terminal in this folder and run:

```
npm install
npx eas-cli login          # your Expo account
npx eas-cli init           # links this folder to a new Expo project
npx eas-cli build --platform ios --profile production
```

The build asks you to log in to your Apple Developer account and offers to create the certificates for you.
Say yes. You type your Apple password yourself; it is never stored in this project.

## Step 5 – Send it to TestFlight

```
npx eas-cli submit --platform ios --latest
```

This uploads the build to App Store Connect. Then:

1. In App Store Connect → your app → **TestFlight**, wait for the build to finish processing (10–30 minutes).
2. Add yourself under **Internal Testing**. Install the **TestFlight** app on your iPhone and accept the invite.
3. For friends and family, create an **External Testing** group and add their emails. The first external build
   needs a short Apple review, usually within a day. Testers need an iPhone with the TestFlight app.

To ship a fix later, run the build and submit commands again; testers get the update in TestFlight.

## Turning on payments (after the test)

1. In App Store Connect, create two auto-renewable subscriptions in one group: monthly (£5.99) and yearly (£39.99).
2. Create a free RevenueCat account, add the iOS app, import the two products, make an entitlement called `plus`
   and an offering containing both.
3. In `eas.json`, set `EXPO_PUBLIC_PAYMENTS_ENABLED` to `true` and paste the RevenueCat iOS key into
   `EXPO_PUBLIC_REVENUECAT_IOS_KEY`. Build and submit again. In TestFlight, purchases are free test purchases.

## Two-week test plan

Week 1 – you and 3–5 close testers:
- [ ] Sign up, create 3 stories with photos and a voice recording each
- [ ] Add to a story a day later; invite someone to add their side
- [ ] Hide a story in Hard memories; delete a photo, a recording and a whole story
- [ ] Create an event wall, open its QR code on another phone, add photos and a voice story as a guest
- [ ] Allow full photo access and try a suggested story; check the words from a voice story
- [ ] Add 3 people and tag them in stories; open a People Page
- [ ] Set a Private passcode, move a story in, and unlock with Face ID
- [ ] Open the map; turn on notifications; download your data

Week 2 – one real event and 10–20 testers:
- [ ] Use an event wall at a real gathering (a birthday or family meal), with approval off then on
- [ ] Try "Only their own" and "Everyone's uploads"; close the wall at the end
- [ ] Collect feedback: what people tried to do and couldn't, where they got stuck, what they'd pay for

## Making changes

The code is plain TypeScript. The quickest way to change things is Claude Code (claude.com/claude-code):
open this folder in it and ask in plain English, for example "run the app in the iOS simulator and fix any errors"
or "add a Favourites screen". Useful commands:

```
npx expo start         # run on your phone with the Expo Go app or a development build
npx tsc --noEmit       # check the code for mistakes
```

## Before a public launch

- Turn email confirmation back on, publish the Privacy Policy and Terms, fill in App Store privacy labels
- Add payments (RevenueCat or StoreKit) with the agreed prices: £5.99 / $6.99 a month, £39.99 / $49.99 a year
- Move event photos to private storage with expiring links (they are public-by-link in this test build)
