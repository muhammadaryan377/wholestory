# Whole Stories Home, Stories, Map, Favourites and Settings update

Branch: `feature/whole-stories-intro-swipe` — do not merge until device testing.

## What changed
- **Today:** same cream/navy/green design tokens; featured real story photo, memory rail, story rail, quick voice/story prompt, small circular profile avatar and an Add Profile Photo prompt when missing. The featured image remains a story, not an unrelated avatar.
- **Settings:** add/change/remove profile photo. Photo is stored in private app documents on the current device, not silently uploaded to Supabase.
- **Stories:** searchable cards, All/Travel/Family/Events/Friends/Everyday life category filters, user-edited category chips, List/Calendar switch and navigation to Map, People, Favourites and Private. Categories are never guessed from photo content.
- **Map:** existing saved-photo GPS story markers preserved; optional My location button prompts for foreground permission, pans to device location, and stops there. No background tracking.
- **Story creation / detail:** optional Use current location and Choose on map actions, plus Remove. User-selected location changes the story's map position locally and preserves the original GPS metadata of each photo. Owners can edit existing non-private story locations.
- **Favourites:** real favorited photo grid, search, story grouping, and Places filter for photos with GPS coordinates. Voice notes tab explicitly explains that individual voice-note favourites are not yet supported.

## Source of data & current limitations
- Featured stories and favourites use **real Supabase stories/photos**; no dummy real-user data.
- Profile photos and manually assigned story categories/GPS pins are saved using per-account AsyncStorage, so they work in this testing build but do not sync between different devices or survive uninstall. Server-side profile photo and story metadata sync will require an approved Supabase migration and storage design before production.
- Current location is only read after tapping Use Current Location or My Location and accepting the device permission.
- Existing photo GPS is still used automatically for photo-backed stories that have no explicit location override.
- Do not assume that today's phone location matches a historical photo's location.
- The new expo-location dependency and permission plugin require a new native build. Reloading a previously installed native binary may fail with missing module.
- Existing map web fallback remains unchanged; the map picker has a separate web form for manual coordinates.
- Existing four-step profile setup, story sharing, Private PIN and invitations remain in the branch.

## Test on a real device
1. New and returning accounts: profile photo prompt only when absent; choose/change/remove then navigate Home ⇄ Settings.
2. Today: story feature image, date anniversary, story cards, no-story empty state, small-screen scroll.
3. Stories: search by title, filter All/Travel etc., edit category via inline options (Android/iOS), calendar month groups, no matches.
4. Create a story with photos' original GPS and no override: it appears on Map at the photo location.
5. Create a story with explicit manual pin: the story appears on Map at chosen pin. Open story and remove/edit pin, verify map update.
6. Use current location: permission denied, allowed once, precise/approximate. Ensure no prompt without button press, no background tracking.
7. Favourites: add a heart to a story photo; grid, search, Story and Place filters; empty Voice notes message.
8. Rebuild EAS iOS dev/preview build after installing expo-location; test different iPhone sizes, offline behavior and navigation.
9. Run `npm ci`, `npx tsc --noEmit`, `npm run lint`, `node scripts/test-regressions.cjs`.

## Pull
```powershell
git fetch origin
git switch feature/whole-stories-intro-swipe
git pull --ff-only origin feature/whole-stories-intro-swipe
npm ci
npx expo start --clear
```

After a fresh native install, use a development build instead of a previously installed build that lacks expo-location.
