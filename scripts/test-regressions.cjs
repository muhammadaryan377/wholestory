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
    '@react-native-async-storage/async-storage': { default: storage },
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
