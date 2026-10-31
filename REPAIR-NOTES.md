# Existing feature repairs

This review repairs the existing flows. Payments remain off. No new product
features, pricing changes, or design changes were introduced. Existing local
edits in app.json, eas.json, story deletion and comments were preserved.

## Fixed in source

- Forgot password now sends a redirect to `/reset-password`, verifies recovery
  sessions, PKCE codes or recovery OTP links, validates matching new passwords,
  updates the password and returns to login. Expired links show a useful error.
- Browser confirmations and rename prompts now work. Async action failures are
  visible, and shared buttons prevent duplicate submissions.
- Authentication protects all account screens, not just tabs. Session startup
  cannot overwrite a later login event. Native token refresh follows app state. Notification launches wait for navigation/auth readiness.
- Profiles are created after login without overwriting an existing name. Profile
  updates no longer require reading protected push-token/preference columns.
- Failed photo uploads clean earlier uploads and roll back incomplete entries or
  newly created stories. Failed event setup/post uploads also roll back.
- Permission-denied deletions no longer report success. Cascading deletions queue
  media for the service-only cleanup worker (deployment below is required).
- Guest storage checks now work with event RLS. Expired links block viewing and
  posting. Guest audio/photo references are checked against the event's storage.
- Link rotation uses cryptographic IDs, restricts rotation to the host, and makes
  an expired link usable again while invalidating the old link.
- Event cards no longer remount on every parent update. Open event walls refresh
  periodically; browser guest deletion failures are shown.
- Recording blocks incomplete saves, preserves edits made during transcription,
  cancels transcription when discarded, and handles permission/start failures.
  Playback restores the non-recording audio mode.
- Calendar dates are parsed as local dates. Impossible event/skip dates are
  rejected, end dates cannot precede start dates, and leap-day reminders wait for
  the next real February 29. Notification preferences are scoped to the account.
- Story lists page through the API row cap, batch ID filters, and search saved
  entry words/captions as well as titles. Loading failures have retry controls.
- Subscription checks switch identities on account changes and surface verification failures; test-build payments stay disabled.
- Favourites update only after a successful save. Photo load errors are visible.
  Photo metadata supports decimal and DMS GPS coordinates.
- Exports include captions/comments/schedule metadata and event covers. Native
  downloads use the file API instead of relying on native Blob.arrayBuffer.
- EAS build profiles no longer override real credentials with `YOUR-*` values.
- Guest-page public configuration is generated from .env without printing keys.

## Required live Supabase setup

The coding session did not modify the live database or send recovery emails.

1. If not already applied, run
   `supabase/migrations/20261030_test_build_fixes.sql` in SQL Editor.
2. Run `supabase/migrations/20261030_working_features.sql`. Both migrations are
   safe to re-run. Do not re-run schema.sql on an initialized project.
3. In Authentication > URL Configuration > Redirect URLs, allow the exact URLs
   used for recovery. For local web testing this is normally
   `http://localhost:8081/reset-password`; also add the actual LAN/hosted web URL
   when testing there. For the installed app add `wholestory://reset-password`.
   Expo Go uses a different generated URL; use a development build for reliable
   device email-link testing. Keep hosted production URLs on HTTPS.
4. The default Supabase recovery email should use its generated ConfirmationURL.
   A custom email must retain the redirect/recovery parameters. Verify email
   delivery/rate limits in Auth logs if no message arrives.

## Media cleanup deployment

Database cascades cannot remove storage bytes by themselves. The migration queues
entry photos/audio, event photos/audio, replaced covers, and cascaded account files.
Deploy `supabase/functions/cleanup-media/index.ts` as `cleanup-media` using the
client-owned Supabase project. The function accepts POST requests authorized with
that project's service-role key, which is available to Edge Functions as a built-in
environment variable. It processes up to 100 queued files per call, retaining failed
items for retry. Schedule it using Supabase Cron/pg_net every few minutes. Store
the service-role credential in Supabase Vault for the scheduled request. Never put
it in .env EXPO_PUBLIC variables, the guest page, EAS public variables, or Git.

Until the worker is deployed and scheduled, database rows delete but queued files
can remain in storage. Existing orphan files from earlier builds are not discovered
retroactively; review them separately rather than blindly deleting storage.

## Guest page and builds

Run `node scripts/configure-guest.cjs` before deploying guest-web. This generates
ignored `guest-web/config.js` containing only the public URL/key. Deploy the entire
folder, including that generated file, and set EXPO_PUBLIC_GUEST_PAGE_URL to its
actual HTTPS address. For Netlify Git deployments, use build command
`node scripts/configure-guest.cjs`, publish directory `guest-web`, and provide the
two public Supabase environment variables in the hosting environment.

Set the real Supabase URL/key, guest URL, support/legal URLs and optional Sentry DSN
in the matching EAS development/preview/production environments. Local .env values
are not a substitute for remote EAS environment configuration.

## Verification and limits

- `node --test scripts/test-regressions.cjs`: 12 passing regression checks.
- SQL migrations exercised in an isolated PostgreSQL 18 fixture with two account
  roles and an anonymous role, including a pgcrypto-in-extensions variant.
  Supabase auth/storage tables and pg_net HTTP delivery are stubbed in this fixture.
- The SQL checks cover profile permissions, anonymous storage upload, guest input,
  private membership/invites, transcript updates, expiry, link rotation and cleanup
  cascades. `scripts/test-database.sql` refuses to run without the fixture marker.
- Expo lint and TypeScript checks passed without diagnostics. Web and iOS exports passed. Guest-page JavaScript syntax check passed.
- Expo Doctor: 18/20 checks passed; online validation was limited by the environment's
  network access. Offline SDK compatibility check passed.

Real iPhone recording, Face ID, push delivery, speech recognition language support,
large-library export memory, hosted guest Safari uploads, email delivery and an EAS
native build still need device/live-service verification. Compilation and mocked
regressions do not establish that those integrations have passed.

First manual test: request a reset email, open the latest link, set matching new
passwords, log in, save a photo/voice story, reopen it, then test the event wall as
a separate guest. Do this after the migration and redirect configuration above.
