const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(output, {
    module, exports: module.exports, URL, URLSearchParams, console, setTimeout, clearTimeout,
    require(name) {
      if (name in mocks) return mocks[name];
      if (name === '@/lib/dates') return load('lib/dates.ts');
      throw new Error(`Unexpected dependency ${name}`);
    }, ...globals,
  }, { filename: file });
  return module.exports;
}

function apiFixture(handler, upload = async () => 'uploaded.jpg') {
  const calls = [];
  const removed = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner', user_metadata: { name: 'Owner' } } }, error: null }) },
    from(table) {
      const call = { table, operation: 'read', payload: null, filters: {}, options: null };
      const query = {
        select(columns) { call.columns = columns; return query; },
        insert(payload) { call.operation = 'insert'; call.payload = payload; return query; },
        upsert(payload, options) { call.operation = 'upsert'; call.payload = payload; call.options = options; return query; },
        update(payload) { call.operation = 'update'; call.payload = payload; return query; },
        delete() { call.operation = 'delete'; return query; },
        eq(key, value) { call.filters[key] = value; return query; },
        in() { return query; }, order() { return query; }, limit() { return query; },
        range(from, to) { call.range = [from, to]; return query; },
        single() { call.single = true; return query; }, maybeSingle() { return query; },
        then(resolve, reject) { calls.push(call); return Promise.resolve(handler(call)).then(resolve, reject); },
      };
      return query;
    },
    storage: { from: bucket => ({ remove: async paths => { removed.push({ bucket, paths }); return { error: null }; } }) },
  };
  class Locked extends Error {}
  const api = load('lib/api.ts', {
    './supabase': { supabase }, './media': { uploadFile: upload },
    './private-access': { privateIsUnlocked: () => false, PrivateLockedError: Locked },
  });
  return { api, calls, removed };
}

test('recovery links accept recovery sessions, PKCE and recovery OTP; reject normal or expired links', () => {
  const { recoveryParams } = load('lib/auth-links.ts');
  const session = recoveryParams('wholestory://reset-password#access_token=a&refresh_token=r&type=recovery');
  assert.equal(session.kind, 'session');
  assert.equal(recoveryParams('https://app.test/reset-password?code=abc').kind, 'code');
  assert.equal(recoveryParams('https://app.test/reset-password?token_hash=abc&type=recovery').kind, 'otp');
  assert.throws(() => recoveryParams('https://app.test/reset-password#access_token=a&refresh_token=r&type=signup'));
  assert.throws(() => recoveryParams('https://app.test/reset-password#error=access_denied&error_description=Expired'), /Expired/);
});

test('sign-up confirmation links accept PKCE, resent-email tokens and OTP; report expired or recovery links', () => {
  const { signupLinkParams } = load('lib/auth-links.ts');
  assert.equal(signupLinkParams('https://app.test/auth/confirm?code=abc').kind, 'code');
  assert.equal(signupLinkParams('wholestory://auth/confirm#access_token=a&refresh_token=r&type=signup').kind, 'session');
  assert.equal(signupLinkParams('https://app.test/auth/confirm?token_hash=abc&type=email').kind, 'otp');
  const expired = signupLinkParams('https://app.test/auth/confirm#error=access_denied&error_description=Link+expired');
  assert.deepEqual({ kind: expired.kind, message: expired.message }, { kind: 'error', message: 'Link expired' });
  assert.equal(signupLinkParams('https://app.test/auth/confirm#access_token=a&refresh_token=r&type=recovery').kind, 'error');
  assert.equal(signupLinkParams('https://app.test/auth/confirm').kind, 'error');
});

test('calendar dates keep their day in western time zones and reject impossible input', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    const { parseDate, localDate, dateInput, validMonthDay } = load('lib/dates.ts', {}, { Date });
    assert.equal(localDate(parseDate('2026-01-01')), '2026-01-01');
    assert.equal(dateInput('31/02/2026'), null);
    assert.equal(dateInput('29/02/2024'), '2024-02-29');
    assert.equal(dateInput('29/02/2026'), null);
    assert.equal(validMonthDay(2, 29), true);
    assert.equal(validMonthDay(4, 31), false);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test('failed story upload removes the new empty story and does not publish an entry', async () => {
  const { api, calls } = apiFixture(call => ({ error: null, data: call.table === 'stories' && call.operation === 'insert' ? { id: 'story', private: false } : call.single ? { private: false } : [] }), async () => { throw new Error('Offline'); });
  await assert.rejects(api.createStory('Test', '2026-10-30', { ...api.emptyDraft(), photos: [{ uri: 'one' }] }), /Offline/);
  assert.ok(calls.some(call => call.table === 'stories' && call.operation === 'delete'));
  assert.equal(calls.filter(call => call.table === 'entries' && call.operation === 'insert').length, 0);
});

test('a later failed photo upload cleans earlier files and keeps the entry unpublished', async () => {
  let number = 0;
  const { api, removed, calls } = apiFixture(() => ({ data: { private: false }, error: null }), async () => {
    if (++number === 2) throw new Error('Upload failed');
    return 'first.jpg';
  });
  await assert.rejects(api.addToStory('story', { ...api.emptyDraft(), photos: [{ uri: 'one' }, { uri: 'two' }] }), /Upload failed/);
  assert.equal(removed[0].paths[0], 'first.jpg');
  assert.equal(calls.some(call => call.table === 'entries'), false);
});

test('deletion blocked by RLS is reported instead of pretending success', async () => {
  const { api, removed } = apiFixture(() => ({ data: [], error: null }));
  await assert.rejects(api.deleteEntry({ id: 'entry', photos: [{ path: 'photo.jpg' }], audio_path: null }), /not deleted/);
  assert.equal(removed.length, 0);
});

test('profile push-token writes do not upsert protected columns', async () => {
  const { api, calls } = apiFixture(call => {
    if (call.operation === 'upsert' && 'push_token' in call.payload) return { data: null, error: new Error('Permission denied') };
    return { data: null, error: null };
  });
  await api.savePushToken('token');
  assert.equal(calls[0].options.ignoreDuplicates, true);
  assert.equal(calls[1].operation, 'update');
  assert.equal(calls[1].filters.id, 'owner');
});

test('story listing reads past the API row cap and searches entry words', async () => {
  const { api } = apiFixture(call => {
    if (call.table === 'stories') {
      const count = call.range[0] === 0 ? 500 : 1;
      return { data: Array.from({ length: count }, (_, i) => ({ id: String(call.range[0] + i), title: 'Story', story_date: '2026-10-30', private: false })), error: null };
    }
    if (call.table === 'entries') return { data: [{ id: 'entry', story_id: '0', text: 'A special picnic', entry_photos: [] }], error: null };
    return { data: [], error: null };
  });
  const stories = await api.listStories();
  assert.equal(stories.length, 501);
  assert.match(stories[0].searchText, /picnic/);
});

test('browser confirmations keep callbacks until the user confirms', () => {
  const { Alert, getDialog, dismissDialog } = load('lib/alert.ts', { 'react-native': { Platform: { OS: 'web' }, Alert: {} } });
  let deleted = false;
  Alert.alert('Delete?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', onPress: () => { deleted = true; } }]);
  assert.equal(deleted, false);
  getDialog().buttons[1].onPress(); dismissDialog();
  assert.equal(deleted, true);
  assert.equal(getDialog(), null);
});

test('anniversary scheduling preserves leap day instead of notifying on March 1', async () => {
  const RealDate = Date;
  class FixedDate extends RealDate { constructor(...args) { if (args.length) super(...args); else super('2026-02-28T12:00:00'); } }
  const scheduled = [];
  const notifications = {
    AndroidImportance: { DEFAULT: 5 }, SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily' },
    setNotificationHandler() {}, cancelAllScheduledNotificationsAsync: async () => {},
    getPermissionsAsync: async () => ({ granted: true }),
    scheduleNotificationAsync: async request => { scheduled.push(request); },
  };
  const { scheduleLocal } = load('lib/notify.ts', {
    'react-native': { Platform: { OS: 'ios' } },
    '@react-native-async-storage/async-storage': {}, 'expo-notifications': notifications,
    'expo-device': {}, 'expo-constants': {}, './api': {},
    './supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' } } } }) } } },
    '@/lib/dates': load('lib/dates.ts', {}, { Date: FixedDate }),
  }, { Date: FixedDate });
  await scheduleLocal([{ id: 'leap', title: 'Leap day', story_date: '2024-02-29' }], { memories: true, dailyPrompt: false });
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].trigger.date.getFullYear(), 2028);
  assert.equal(scheduled[0].trigger.date.getMonth(), 1);
  assert.equal(scheduled[0].trigger.date.getDate(), 29);
});

test('photo metadata accepts DMS GPS and does not reverse already-negative coordinates', () => {
  const { photoMetadata } = load('lib/photo-metadata.ts');
  const photo = photoMetadata({ GPSLatitude: [33, 30, 0], GPSLatitudeRef: 'S', GPSLongitude: -70, GPSLongitudeRef: 'W', DateTimeOriginal: '2026:10:30 09:15:00' });
  assert.equal(photo.lat, -33.5);
  assert.equal(photo.lng, -70);
  assert.equal(photo.takenAt, '2026-10-30T09:15:00');
  assert.equal(photoMetadata({ GPSLatitude: 999 }).lat, null);
});

test('cleanup worker rejects callers without the service credential and retains failed removals', async () => {
  let handler;
  let deletionCount = 0;
  let storageFails = true;
  const client = {
    from: () => ({
      select() { return this; }, order() { return this; },
      limit: async () => ({ data: [{ id: 1, bucket: 'media', path: 'deleted.jpg' }], error: null }),
      delete() { return this; }, in: async () => { deletionCount++; return { error: null }; },
    }),
    storage: { from: () => ({ remove: async () => ({ error: storageFails ? new Error('Offline') : null }) }) },
  };
  load('supabase/functions/cleanup-media/index.ts', { 'npm:@supabase/supabase-js@2': { createClient: () => client } }, {
    Deno: { env: { get: name => name === 'SUPABASE_SERVICE_ROLE_KEY' ? 'test-service-key' : 'http://local.test' }, serve: value => { handler = value; } },
    Request, Response,
  });
  assert.equal((await handler(new Request('http://local.test', { method: 'POST' }))).status, 403);
  const request = () => new Request('http://local.test', { method: 'POST', headers: { Authorization: 'Bearer test-service-key' } });
  const failed = await (await handler(request())).json();
  assert.equal(failed.removed, 0);
  assert.equal(deletionCount, 0);
  storageFails = false;
  const success = await (await handler(request())).json();
  assert.equal(success.removed, 1);
  assert.equal(deletionCount, 1);
});

test('enabled subscription checks switch user identity and propagate verification failures', async () => {
  const configured = [], loggedIn = [];
  let fail = false;
  const purchases = {
    configure: options => configured.push(options.appUserID),
    logIn: async id => loggedIn.push(id),
    getCustomerInfo: async () => { if (fail) throw new Error('Store unavailable'); return { entitlements: { active: {} } }; },
  };
  const payments = load('lib/payments.ts', {
    'react-native': { Platform: { OS: 'ios' } }, 'react-native-purchases': purchases,
  }, { process: { env: { EXPO_PUBLIC_PAYMENTS_ENABLED: 'true', EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'test-key' } } });
  assert.equal(await payments.hasAccess('first-user'), false);
  assert.equal(await payments.hasAccess('second-user'), false);
  assert.equal(configured[0], 'first-user');
  assert.equal(loggedIn[0], 'second-user');
  fail = true;
  await assert.rejects(payments.hasAccess('second-user'), /Store unavailable/);
});

test('public story invitations use one HTTPS link and never share custom schemes', () => {
  const links = load('lib/invite-links.ts', {}, { process: { env: { EXPO_PUBLIC_INVITE_BASE_URL: 'https://wholestory.app' } } });
  const url = links.buildInviteUrl('e84365e5ffc7');
  assert.equal(url, 'https://wholestory.app/join/e84365e5ffc7');
  assert.match(links.inviteMessage('Home sweet Home', url), /https:\/\/wholestory\.app\/join\/e84365e5ffc7/);
  assert.equal(links.inviteMessage('Home sweet Home', url).includes('wholestory://'), false);
  assert.equal(links.nativeInvitePath('e84365e5ffc7'), '/join/e84365e5ffc7');
  assert.throws(() => links.buildInviteUrl('../bad'), /invalid/);
  assert.throws(() => links.buildInviteUrl('short'), /invalid/);
  assert.throws(() => links.inviteWebOrigin('http://insecure.example'), /HTTPS/);
  assert.throws(() => links.inviteWebOrigin('https://test.example/custom/path'), /HTTPS/);
  assert.throws(() => links.inviteWebOrigin(''), /not configured/);
});

test('pending invitation survives sign-in transitions and clears only the matching code', async () => {
  const records = new Map();
  const storage = {
    getItem: async key => records.get(key) ?? null,
    setItem: async (key, value) => { records.set(key, value); },
    removeItem: async key => { records.delete(key); },
  };
  const links = load('lib/invite-links.ts', {}, { process: { env: {} } });
  const pending = load('lib/pending-invite.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
    './invite-links': links,
  }, { Date });
  await pending.rememberInvite('e84365e5ffc7');
  assert.equal(await pending.pendingInvite(), 'e84365e5ffc7');
  await pending.clearPendingInvite('anothercode1');
  assert.equal(await pending.pendingInvite(), 'e84365e5ffc7');
  await pending.clearPendingInvite('e84365e5ffc7');
  assert.equal(await pending.pendingInvite(), null);
  await assert.rejects(pending.rememberInvite('../unsafe'), /Invalid/);
});

test('story categories and map locations are stored per account with explicit user selection', async () => {
  const cache = new Map();
  const storage = { getItem: async key => cache.get(key) ?? null,
    setItem: async (key, value) => { cache.set(key, value); },
    removeItem: async key => { cache.delete(key); } };
  const id = '00000000-0000-4000-8000-000000000001';
  const supabase = { auth: { getSession: async () => ({ data: { session: { user: { id: 'first' } } } }) } };
  const prefs = load('lib/story-preferences.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
    './supabase': { supabase },
    './api': { listStories: async () => [{ id, title: 'Trip', lat: 20, lng: 30 }] },
  });
  await prefs.saveStoryPreference('first', id, { category: 'Travel', location: { lat: 50.1, lng: 3.2, source: 'manual' } });
  assert.equal((await prefs.getStoryPreferences('first'))[id].category, 'Travel');
  assert.equal(Object.keys(await prefs.getStoryPreferences('second')).length, 0);
  const [story] = await prefs.listStoriesWithPreferences();
  assert.equal(story.category, 'Travel');
  assert.equal(story.lat, 50.1);
  assert.equal(story.lng, 3.2);
  await prefs.clearStoryLocation('first', id);
  assert.equal((await prefs.getStoryPreferences('first'))[id].location, undefined);
  assert.equal((await prefs.getStoryPreferences('first'))[id].category, 'Travel');
  await assert.rejects(prefs.saveStoryPreference('first', id, { location: { lat: 191, lng: 30, source: 'current' } }), /Invalid location/);
  await assert.rejects(prefs.saveStoryPreference('first', id, { category: 'Machine guessed it' }), /Invalid category/);
});

test('connection and missing-record errors are shown in plain words', () => {
  const { friendlyMessage } = load('lib/alert.ts', { 'react-native': { Alert: {}, Platform: { OS: 'android' } } });
  assert.match(friendlyMessage('TypeError: Network request failed'), /internet connection/);
  assert.match(friendlyMessage('Failed to fetch'), /internet connection/);
  assert.match(friendlyMessage('Cannot coerce the result to a single JSON object'), /no longer available/);
  assert.equal(friendlyMessage('Name your event'), 'Name your event');
  assert.equal(friendlyMessage(undefined), 'Please try again.');
});

test('finished onboarding follows the account to a new phone and does not skip it for new accounts', async () => {
  const cache = new Map();
  let metadata = {};
  const updates = [];
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'user', user_metadata: metadata } } } }),
      updateUser: async patch => { updates.push(patch); metadata = { ...metadata, ...patch.data }; return { data: {}, error: null }; },
    },
    // A server that has no user_onboarding table yet, so only the auth metadata can carry the account's state.
    from: () => {
      const missing = { data: null, error: { code: 'PGRST205' } };
      const query = { select: () => query, eq: () => query, maybeSingle: async () => missing, upsert: async () => missing };
      return query;
    },
  };
  const onboarding = load('lib/onboarding.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async key => cache.get(key) ?? null, setItem: async (key, value) => { cache.set(key, value); },
      multiSet: async pairs => pairs.forEach(([key, value]) => cache.set(key, value)),
    } },
    './supabase': { supabase },
  });
  assert.equal((await onboarding.readOnboardingState('user')).done, false);
  await onboarding.markSetupComplete('user');
  assert.equal(updates[0].data.setup_complete, true);
  cache.clear(); // a new phone or a reinstall
  assert.equal((await onboarding.readOnboardingState('user')).done, true);
  assert.equal(cache.get('ws_onboarded_user'), '1');
  cache.clear();
  assert.equal((await onboarding.readOnboardingState('someone-else')).done, false);
});

test('a photo already resolved needs no more requests, and a private one stays locked', async () => {
  let queries = 0, unlocked = true;
  class PrivateLockedError extends Error {}
  const row = isPrivate => ({ eq: () => ({ maybeSingle: async () => { queries++; return { data: { entries: { stories: { private: isPrivate } } }, error: null }; } }) });
  const privatePaths = new Set(['private.jpg']);
  let current = '';
  const supabase = {
    from: () => ({ select: () => row(privatePaths.has(current)) }),
    storage: { from: () => ({ createSignedUrl: async path => ({ data: { signedUrl: 'https://signed/' + path }, error: null }) }) },
  };
  const media = load('lib/media.ts', {
    'expo-file-system': { File: class {} }, 'react-native': { Platform: { OS: 'android' } },
    'expo-image-manipulator': { ImageManipulator: {}, SaveFormat: {} }, './supabase': { supabase },
    './private-access': { privateIsUnlocked: () => unlocked, PrivateLockedError },
  });
  current = 'open.jpg';
  assert.equal(await media.viewUrl('open.jpg'), 'https://signed/open.jpg');
  assert.equal(await media.viewUrl('open.jpg'), 'https://signed/open.jpg');
  assert.equal(queries, 1);
  current = 'private.jpg';
  assert.equal(await media.viewUrl('private.jpg'), 'https://signed/private.jpg');
  unlocked = false;
  await assert.rejects(media.viewUrl('private.jpg'), PrivateLockedError);
});

test('deleting an account clears only that account from this phone', async () => {
  const uid = '00000000-0000-4000-8000-000000000003';
  const cache = new Map([['ws_story_preferences_v1_' + uid, '{}'], ['ws_onboarded_' + uid, '1'], ['ws_place_names_v1', '{}'], ['ws_story_preferences_v1_other', '{}'], ['ws_intro_seen_v1', '1']]);
  const removedPhoto = [], removedSecret = [];
  const { clearLocalAccountData } = load('lib/account-data.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getAllKeys: async () => [...cache.keys()], multiRemove: async keys => keys.forEach(key => cache.delete(key)) } },
    'expo-secure-store': { deleteItemAsync: async key => { removedSecret.push(key); throw new Error('not on web'); } },
    './profile-photo': { removeLocalProfilePhoto: async id => { removedPhoto.push(id); } },
  });
  await clearLocalAccountData(uid);
  assert.deepEqual(removedPhoto, [uid]);
  assert.deepEqual(removedSecret, ['ws_private_passcode_' + uid]);
  assert.deepEqual([...cache.keys()].sort(), ['ws_intro_seen_v1', 'ws_story_preferences_v1_other']);
});

test('story rows, threads, map groups and the grown card are built from real story data', () => {
  const display = load('lib/story-display.ts');
  const story = (id, extra) => ({ id, title: id, story_date: '2025-09-15', entryCount: 1, photoCount: 2, cover: id + '.jpg', ...extra });

  assert.equal(display.storyMeta(story('a', { entryCount: 3, photoCount: 0, takenDates: ['2021-01-02T10:00:00Z', '1970-01-01T00:00:00Z'] })), '3 chapters · 2021 - 2025');
  assert.match(display.storyMeta(story('a', { photoCount: 120 })), /^1 chapter · 15 Sept? 2025 · 120 photos$/);

  assert.deepEqual(Array.from(display.buildThreads([]), t => t.key), []);
  const threads = display.buildThreads([story('a', { category: 'Family', entryCount: 2, photoCount: 5 }), story('b')]);
  assert.deepEqual(Array.from(threads, t => t.key), ['All', 'Family']);
  assert.equal(threads[1].sub, '2 chapters · 5 photos');

  const nearby = [story('a', { lat: 41.9, lng: 12.5 }), story('b', { lat: 41.91, lng: 12.51 }), story('far', { lat: 45.4, lng: 12.3 }), story('nowhere')];
  const wide = display.clusterStories(nearby, { latitudeDelta: 10, longitudeDelta: 10 });
  assert.equal(wide.length, 2);
  assert.equal(wide[0].photos, 4);
  assert.equal(display.clusterStories(nearby, { latitudeDelta: 0.01, longitudeDelta: 0.01 }).length, 3);

  const now = Date.parse('2026-11-09T12:00:00Z');
  const added = (author, created_at, photos, voice = false) => ({ author, created_at, photos, voice });
  const grown = story('Italy', { activity: [added('other', '2026-11-08T00:00:00Z', 3), added('other', '2026-11-09T00:00:00Z', 0, true), added('me', '2026-11-09T01:00:00Z', 9)] });
  assert.equal(display.findStoryGrowth([grown], 'me', {}, now).message, '3 new photos and a voice story were added to Italy');
  assert.equal(display.findStoryGrowth([grown], 'me', { Italy: '2026-11-09T00:00:00Z' }, now), null);
  assert.equal(display.findStoryGrowth([story('old', { activity: [added('other', '2026-01-01T00:00:00Z', 1)] })], 'me', {}, now), null);
  assert.equal(display.findStoryGrowth([story('own', { activity: [added('me', '2026-11-09T00:00:00Z', 1)] })], 'me', {}, now), null);
  assert.equal(display.findStoryGrowth([story('one', { activity: [added('other', '2026-11-09T00:00:00Z', 1)] })], 'me', {}, now).message, '1 new photo was added to one');
});

test('story tags and favourites are cleaned and a hearted photo marks its story until overridden', async () => {
  const cache = new Map();
  const storage = { getItem: async key => cache.get(key) ?? null, setItem: async (key, value) => { cache.set(key, value); } };
  const id = '00000000-0000-4000-8000-000000000002';
  const prefs = load('lib/story-preferences.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
    './supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'first' } } } }) } } },
    './api': { listStories: async () => [{ id, title: 'Trip' }], listFavourites: async () => [{ story_id: id }] },
  });
  assert.equal((await prefs.listStoriesWithPreferences())[0].favourite, true);
  await prefs.saveStoryPreference('first', id, { favourite: false, tags: [' Baking ', 'Baking', '', 'a', 'b', 'c', 'd', 'e'] });
  const [story] = await prefs.listStoriesWithPreferences();
  assert.equal(story.favourite, false);
  assert.deepEqual(Array.from(story.tags), ['Baking', 'a', 'b', 'c', 'd']);
});

test('the Android map is only drawn when the build carries a Google Maps key', () => {
  const file = path.join(__dirname, '..', 'app.config.js');
  const base = { plugins: ['expo-router'], extra: { eas: { projectId: 'x' } } };
  const previous = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  delete require.cache[file];
  const configure = require(file);
  try {
    delete process.env.GOOGLE_MAPS_ANDROID_API_KEY;
    const without = configure({ config: base });
    assert.equal(without.extra.androidMapsEnabled, false);
    assert.equal(without.extra.eas.projectId, 'x');
    assert.deepEqual(without.plugins, ['expo-router']);
    process.env.GOOGLE_MAPS_ANDROID_API_KEY = 'test-key';
    const withKey = configure({ config: base });
    assert.equal(withKey.extra.androidMapsEnabled, true);
    assert.deepEqual(withKey.plugins.at(-1), ['react-native-maps', { androidGoogleMapsApiKey: 'test-key' }]);
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_MAPS_ANDROID_API_KEY;
    else process.env.GOOGLE_MAPS_ANDROID_API_KEY = previous;
  }
});

test('iOS presentation uses the approved Whole Story name and packaged fonts', () => {
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
  const theme = fs.readFileSync(path.join(__dirname, '..', 'lib/theme.ts'), 'utf8');
  const layout = fs.readFileSync(path.join(__dirname, '..', 'app/_layout.tsx'), 'utf8');
  const ui = fs.readFileSync(path.join(__dirname, '..', 'components/ui.tsx'), 'utf8');
  const settings = fs.readFileSync(path.join(__dirname, '..', 'app/(tabs)/settings.tsx'), 'utf8');
  assert.equal(app.expo.name, 'Whole Story');
  assert.equal(app.expo.ios.bundleIdentifier, 'app.wholestory.ios');
  assert.match(theme, /Newsreader_600SemiBold/);
  assert.match(theme, /Inter_400Regular/);
  assert.match(theme, /Inter_500Medium/);
  assert.match(layout, /useFonts\(/);
  assert.match(ui, /btnText: \{ fontFamily: F\.sansMedium/);
  assert.match(settings, /router\.replace\('\/'\)/);
  const locationPlugin = app.expo.plugins.find(p => Array.isArray(p) && p[0] === 'expo-location');
  assert.equal(locationPlugin[1].isIosBackgroundLocationEnabled, false);
});

test('reference photography is bundled locally and used in each intended app stage', () => {
  const root = path.join(__dirname, '..');
  const welcome = fs.readFileSync(path.join(root, 'app/welcome.tsx'), 'utf8');
  const onboarding = fs.readFileSync(path.join(root, 'app/onboarding.tsx'), 'utf8');
  const home = fs.readFileSync(path.join(root, 'app/(tabs)/index.tsx'), 'utf8');
  const settings = fs.readFileSync(path.join(root, 'app/(tabs)/settings.tsx'), 'utf8');
  for (const filename of ['couple.jpg', 'dog.jpg', 'timeline.jpg', 'voice.jpg', 'community.jpg', 'photo-collage.jpg', 'plan-collage.jpg']) {
    const asset = path.join(root, 'assets/onboarding', filename);
    assert.equal(fs.existsSync(asset), true, filename + ' missing');
    assert.ok(fs.statSync(asset).size > 1500, filename + ' is unexpectedly small');
  }
  for (const filename of ['hero_couple_clean.jpg', 'photo_dog.jpg', 'photo_voice.jpg', 'timeline_greece.jpg', 'timeline_dinner.jpg', 'timeline_engagement.jpg', 'collab_friends.jpg', 'collab_mountains.jpg', 'collab_outdoors.jpg', 'collab_dinner.jpg', 'splash_glow_background.jpg']) {
    assert.ok(welcome.includes('onboarding/' + filename), 'welcome not using ' + filename);
    const bytes = fs.readFileSync(path.join(root, 'assets/onboarding', filename));
    assert.ok(bytes.length > 1500, filename + ' is unexpectedly small');
    assert.equal(bytes.subarray(0, 2).toString('hex'), filename.endsWith('.png') ? '8950' : 'ffd8', filename + ' is not a valid image format');
  }
  assert.ok(onboarding.includes('onboarding/photo-collage.jpg'));
  assert.ok(onboarding.includes('onboarding/plan-collage.jpg'));
  assert.ok(!home.includes('assets/onboarding/'), 'Home must not show onboarding stock photography');
  assert.ok(settings.includes('Replay the five photo-led welcome screens'));
  assert.ok(!welcome.includes('images.unsplash.com'));
  assert.ok(!onboarding.includes('images.unsplash.com'));
});
