# Wholestory: handover readiness

Updated repair details and deployment requirements: [REPAIR-NOTES.md](REPAIR-NOTES.md).

Status is based on source review and local checks, not on real iPhone testing.
Payments remain off. Brand, pricing, on-device transcription and public-by-link
event media remain as specified in the brief.

Local verification: TypeScript check, Expo lint, iOS export and web export passed.
Guest-page JavaScript syntax check passed. Offline SDK dependency check passed;
it does not verify against the latest online patch releases. Exports reported a
nonfatal Expo Router package-export warning from the Sentry integration. Native
compilation, device runtime behavior and live database policies remain unverified.

## Changes prepared

- Web map fallback prevents loading native maps in the browser.
- Login and signup show errors on screen and recover from failed requests.
- Supabase URL ignores an accidental `/rest/v1` suffix.
- Session loading cannot leave the app stuck forever after a rejected request.
- Story/event photos resize to at most 2048 pixels on the long edge before upload.
- Browser uploads read blob URLs and preserve recording MIME types.
- Guest photos resize before upload; sending while recording is prevented.
- Event photo/audio views refresh when their storage path changes.
- ZIP export works in browsers, uses unique folders, includes pending event posts,
  and reports a failed download instead of silently skipping it.
- Development client dependency is installed.
- Sentry integration is prepared, disabled until a client DSN is supplied.
- Private passcodes are scoped to the signed-in user; reset requires the account
  password. The in-memory unlock clears when the app backgrounds or signs out.
- Private stories are excluded from People Pages and Favourites. Story reads and
  signed media URLs check the local unlock.

## Required database step before testing

For an existing database, run only
`supabase/migrations/20261030_test_build_fixes.sql` in Supabase SQL Editor.
Do not re-run the original schema against an already initialized project.
For a new database, run schema.sql first, then the migration.

The migration restricts profile visibility, hides push tokens/preferences from
profile reads, enables entry-author updates and blocks contributors/invites from
accessing stories moved into Private. It has not been applied to the live project
by this coding session. Verify with two independent user accounts.

## Handover requirements still pending

| Requirement | Status / completion evidence needed |
| --- | --- |
| Backend | App opens; signup, photo/audio story and event saves need live verification |
| Guest page | Source ready; real Supabase public credentials, hosting URL and deployment needed |
| Two real iPhones, one older | Not tested; development build and client devices needed |
| EAS / Apple configuration | Project is linked locally; remote environment values and Apple build/install still need verification |
| Crash reporting | Code prepared; client Sentry DSN, organization, project and EAS secret auth token needed; verify a test crash in release build |
| Photo resize | Implemented in app and guest page; inspect dimensions of a real upload |
| TestFlight | No build submitted or installed by internal testers |
| Privacy Policy / Terms | Client-approved live URLs and link verification needed |
| Client GitHub | Initial code was pushed; this repair pass is local until separately pushed |
| Two-week support | Needs 10–20 testers, real event, shared issue list and scheduled updates |

Sentry variables: `EXPO_PUBLIC_SENTRY_DSN` in local/build environments;
`SENTRY_ORG`, `SENTRY_PROJECT` and secret `SENTRY_AUTH_TOKEN` in EAS.
No session replay or performance tracing is enabled. Confirm crash payload privacy
and source-map uploads before inviting testers.

## Known issues / release blockers

- Password recovery is implemented; configure the redirect allowlist and verify live email delivery (REPAIR-NOTES.md).
- Event/account deletion and guest deletion do not reliably remove all storage
  objects. Database cascades do not delete stored files; the prepared cleanup worker must be deployed/scheduled before promising “delete everywhere”.
- Storage authorization, guest RPC inputs, upload limits/rate limiting and public
  function grants need a complete second-user/anonymous security test.
- Exports still assemble the ZIP in memory; test large libraries on the older phone.
- Private lock needs device regression testing across Face ID, background/foreground,
  direct links, photos, account switching and reset. Existing development passcodes
  used a device-global key; the new per-user key requires setting a passcode again.
- Payments are intentionally off; purchase identity/access behavior is not approved
  for enabling payments.
- npm reports dependency vulnerabilities; review before release without forcing
  incompatible upgrades.

## Test order

1. Apply the migration and restart Metro after dependency changes.
2. Signup, confirmation (if enabled), login, logout and login again.
3. Save and reopen text, photo and audio stories. Check original photo date/location,
   playback in silent mode and on-device transcription.
4. Add to a shared story using a second account; check comments and deletion rules.
5. Move a shared story into Private; verify the second account and old invite cannot
   read it. Test passcode, Face ID, background lock and password-confirmed reset.
6. Create an event; test guest Safari uploads, approval, own/all visibility, expiry,
   rotation, closure, comments and host/guest deletion.
7. Test suggestions with limited/full photo access and 3000+ photos; favourites,
   map, People Pages, Hard memories and all notification types on real iPhones.
8. Export a library and compare files with source records; test a failed download.
9. Verify crash reporting, support/legal links, then create an internal TestFlight
   build and record installs on both phones before external beta review.
