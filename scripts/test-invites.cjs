/*
 * Tests for the story invitation flow: sharing, link parsing, joining (successful / invalid / expired),
 * keeping the invitation through login, and the Universal Link / App Link configuration tooling.
 *
 * Run: node scripts/test-invites.cjs
 * These tests run in Node. They do NOT prove anything about real devices, a real domain, Apple or Google.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://invite.test.example'; // a made-up host used only inside these tests

function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(path.join(ROOT, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(output, {
    module, exports: module.exports, URL, URLSearchParams, console, setTimeout, clearTimeout, Date, Promise, Error,
    require(name) {
      if (name in mocks) return mocks[name];
      if (name === './invite-links') return load('lib/invite-links.ts', {}, { process: { env: { EXPO_PUBLIC_INVITE_BASE_URL: BASE } } });
      throw new Error('Unexpected dependency ' + name);
    }, ...globals,
  }, { filename: file });
  return module.exports;
}

const links = load('lib/invite-links.ts', {}, { process: { env: { EXPO_PUBLIC_INVITE_BASE_URL: BASE } } });
const flow = load('lib/invite-flow.ts');
const CODE = 'e84365e5ffc7';
// Objects built inside the vm sandbox have a different Object prototype, so compare them as plain JSON.
const plain = value => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------- invitation links

test('the shared invitation is one clickable HTTPS link on the configured website', () => {
  assert.equal(links.buildInviteUrl(CODE), BASE + '/join/' + CODE);
  assert.equal(links.buildInviteUrl('AbC_123-xyz'), BASE + '/join/AbC_123-xyz');
  assert.throws(() => links.buildInviteUrl('../etc'), /invalid/);
  assert.throws(() => links.buildInviteUrl('a b c d e f'), /invalid/);
  assert.throws(() => links.buildInviteUrl('short'), /invalid/);
});

test('parseInviteLink only trusts the configured website, the app scheme and the in-app route', () => {
  assert.equal(links.parseInviteLink(BASE + '/join/' + CODE), CODE);
  assert.equal(links.parseInviteLink(BASE + '/join/' + CODE + '/'), CODE);
  assert.equal(links.parseInviteLink(BASE + '/join/' + CODE + '?utm_source=whatsapp#top'), CODE);
  assert.equal(links.parseInviteLink('wholestory://join/' + CODE), CODE);
  assert.equal(links.parseInviteLink('/join/' + CODE), CODE);
  assert.equal(links.parseInviteLink('  ' + BASE + '/join/' + CODE + '  '), CODE);

  assert.equal(links.parseInviteLink('https://evil.example/join/' + CODE), null, 'another website');
  assert.equal(links.parseInviteLink('http://invite.test.example/join/' + CODE), null, 'not HTTPS');
  assert.equal(links.parseInviteLink('https://invite.test.example.evil.example/join/' + CODE), null, 'look-alike host');
  assert.equal(links.parseInviteLink(BASE + '/other/' + CODE), null, 'wrong path');
  assert.equal(links.parseInviteLink(BASE + '/join/' + CODE + '/extra'), null, 'extra path');
  assert.equal(links.parseInviteLink(BASE + '/join/short'), null, 'code too short');
  assert.equal(links.parseInviteLink(BASE + '/join/%E0%A4%A'), null, 'broken encoding');
  assert.equal(links.parseInviteLink('wholestory://other/' + CODE), null);
  assert.equal(links.parseInviteLink('javascript:alert(1)'), null);
  assert.equal(links.parseInviteLink(''), null);
  assert.equal(links.parseInviteLink(undefined), null);
  assert.equal(links.parseInviteLink(12345), null);
  assert.equal(links.parseInviteLink('/join/' + 'x'.repeat(3000)), null);
});

test('https links are rejected when no invitation website is configured', () => {
  const unconfigured = load('lib/invite-links.ts', {}, { process: { env: {} } });
  assert.equal(unconfigured.parseInviteLink(BASE + '/join/' + CODE), null);
  assert.equal(unconfigured.parseInviteLink('wholestory://join/' + CODE), CODE, 'the app scheme still works');
  assert.throws(() => unconfigured.buildInviteUrl(CODE), /not configured/);
});

test('the "open in app" address and the app scheme match app.json', () => {
  assert.equal(links.openInAppUrl(CODE), 'wholestory://join/' + CODE);
  assert.throws(() => links.openInAppUrl('bad'), /invalid/);
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;
  assert.equal(appJson.scheme, links.INVITE_APP_SCHEME);
});

test('store links are shown only when real https store addresses are configured', () => {
  assert.deepEqual(plain(links.appStoreLinks(undefined, undefined)), { ios: null, android: null });
  assert.deepEqual(plain(links.appStoreLinks('http://apps.example/x', 'not a url')), { ios: null, android: null });
  assert.deepEqual(plain(links.appStoreLinks('https://apps.example/app', 'https://play.example/app')), { ios: 'https://apps.example/app', android: 'https://play.example/app' });
});

// ---------------------------------------------------------------- joining: successful, invalid, expired

test('a valid invitation joins the story and the saved invitation is cleared', async () => {
  const cleared = [];
  const result = await flow.completeInvite(CODE, async code => { assert.equal(code, CODE); return 'story-123'; }, async code => { cleared.push(code); });
  assert.deepEqual(plain(result), { ok: true, storyId: 'story-123' });
  assert.deepEqual(cleared, [CODE]);
});

test('an invalid invitation explains why and is cleared (it can never work)', async () => {
  for (const message of ['This invite link is not valid', 'invalid input syntax for type uuid']) {
    const cleared = [];
    const result = await flow.completeInvite(CODE, async () => { throw new Error(message); }, async code => { cleared.push(code); });
    assert.equal(result.ok, false);
    assert.equal(result.kind, 'invalid');
    assert.equal(result.retryable, false);
    assert.match(result.title, /isn’t valid/);
    assert.deepEqual(cleared, [CODE]);
  }
});

test('a badly formed code never reaches the database', async () => {
  let called = false;
  const result = await flow.completeInvite('../x', async () => { called = true; return 'x'; }, async () => {});
  assert.equal(called, false);
  assert.equal(result.kind, 'invalid');
});

test('an expired invitation says so and is cleared', async () => {
  const cleared = [];
  const result = await flow.completeInvite(CODE, async () => { throw new Error('This invite link has expired'); }, async code => { cleared.push(code); });
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'expired');
  assert.match(result.title, /expired/);
  assert.equal(result.retryable, false);
  assert.deepEqual(cleared, [CODE]);
});

test('a private story cannot be joined and the invitation is cleared', async () => {
  const result = await flow.classifyJoinError(new Error('Private stories cannot be joined'));
  assert.equal(result.kind, 'private');
  assert.equal(result.clearPending, true);
});

test('a lost connection or a login problem keeps the saved invitation so it can be retried', async () => {
  for (const [message, kind] of [
    ['Network request failed', 'network'], ['Failed to fetch', 'network'], ['The request timed out', 'network'],
    ['Please sign in first', 'signin'], ['JWT expired', 'signin'], ['Something unexpected', 'unknown'],
  ]) {
    const cleared = [];
    const result = await flow.completeInvite(CODE, async () => { throw new Error(message); }, async code => { cleared.push(code); });
    assert.equal(result.kind, kind, message);
    assert.equal(result.retryable, true, message);
    assert.equal(result.clearPending, false, message);
    assert.deepEqual(cleared, [], message + ' must not clear the invitation');
  }
});

test('an expired login session is not mistaken for an expired invitation', () => {
  assert.equal(flow.classifyJoinError(new Error('JWT expired')).kind, 'signin');
  assert.equal(flow.classifyJoinError({ message: 'This invite link has expired' }).kind, 'expired');
  assert.equal(flow.classifyJoinError('This invite link is not valid').kind, 'invalid');
  assert.equal(flow.classifyJoinError(null).kind, 'unknown');
});

test('a failure while clearing the saved invitation does not hide the join result', async () => {
  const result = await flow.completeInvite(CODE, async () => 'story-9', async () => { throw new Error('storage unavailable'); });
  assert.equal(result.ok, true);
});

// ---------------------------------------------------------------- invitation kept through login and signup

function memoryStorage(initial = {}) {
  const records = new Map(Object.entries(initial));
  return {
    records,
    api: { getItem: async key => records.get(key) ?? null, setItem: async (key, value) => { records.set(key, value); }, removeItem: async key => { records.delete(key); } },
  };
}

function pendingModule(storage) {
  return load('lib/pending-invite.ts', { '@react-native-async-storage/async-storage': { __esModule: true, default: storage.api } });
}

test('the invitation is remembered across login/signup and used for the right story afterwards', async () => {
  const storage = memoryStorage();
  const pending = pendingModule(storage);
  await pending.rememberInvite(CODE); // saved on the join page before the person is sent to log in / sign up
  assert.equal(await pending.pendingInvite(), CODE); // read again by the home route once they are signed in
  const joined = [];
  const result = await flow.completeInvite(await pending.pendingInvite(), async code => { joined.push(code); return 'the-right-story'; }, pending.clearPendingInvite);
  assert.equal(result.storyId, 'the-right-story');
  assert.deepEqual(joined, [CODE]);
  assert.equal(await pending.pendingInvite(), null, 'cleared after the story was joined');
});

test('after a failed attempt because of the network the invitation is still there for the next try', async () => {
  const storage = memoryStorage();
  const pending = pendingModule(storage);
  await pending.rememberInvite(CODE);
  await flow.completeInvite(CODE, async () => { throw new Error('Network request failed'); }, pending.clearPendingInvite);
  assert.equal(await pending.pendingInvite(), CODE);
  await flow.completeInvite(CODE, async () => { throw new Error('This invite link has expired'); }, pending.clearPendingInvite);
  assert.equal(await pending.pendingInvite(), null, 'an expired invitation is removed');
});

test('a saved invitation that is older than 14 days, or from the future, is discarded', async () => {
  const key = 'ws_pending_story_invite_v1';
  const day = 86400 * 1000;
  for (const age of [15 * day, -day]) {
    const storage = memoryStorage({ [key]: JSON.stringify({ code: CODE, createdAt: Date.now() - age }) });
    assert.equal(await pendingModule(storage).pendingInvite(), null, 'age ' + age);
    assert.equal(storage.records.has(key), false, 'removed from storage');
  }
  const fresh = memoryStorage({ [key]: JSON.stringify({ code: CODE, createdAt: Date.now() - 13 * day }) });
  assert.equal(await pendingModule(fresh).pendingInvite(), CODE);
  const junk = memoryStorage({ [key]: '{not json' });
  assert.equal(await pendingModule(junk).pendingInvite(), null);
});

test('login, signup and onboarding all return to the home route that resumes the saved invitation', () => {
  const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.match(read('app/index.tsx'), /pendingCode[\s\S]*pathname: '\/join\/\[code\]'/, 'home route resumes the pending invitation');
  assert.match(read('app/sign-in.tsx'), /router\.replace\('\/'\)/);
  assert.match(read('app/sign-up.tsx'), /router\.replace\('\/onboarding'\)/);
  assert.match(read('app/onboarding.tsx'), /router\.replace\('\/'\)/, 'new accounts finish setup and return to the home route');
  assert.match(read('app/auth/callback.tsx'), /router\.replace\('\/'\)/, 'Apple/Google sign-in on the web returns to the home route');
  const join = read('app/join/[code].tsx');
  assert.match(join, /rememberInvite\(code\)/);
  assert.match(join, /completeInvite\(code, joinStory, clearPendingInvite\)/);
});

// ---------------------------------------------------------------- native share sheet

function shareModule({ os = 'ios', env = { EXPO_PUBLIC_INVITE_BASE_URL: BASE }, navigator, shareResult = { action: 'sharedAction' } } = {}) {
  const calls = { share: [], copied: [] };
  const mocks = {
    'react-native': { Platform: { OS: os }, Share: { dismissedAction: 'dismissedAction', share: async (content, options) => { calls.share.push({ content, options }); return shareResult; } } },
    'expo-clipboard': { setStringAsync: async value => { calls.copied.push(value); } },
    './invite-links': load('lib/invite-links.ts', {}, { process: { env } }),
  };
  return { calls, mod: load('lib/invite-actions.ts', mocks, { globalThis: { navigator } }) };
}

test('sharing hands the native share sheet one message with a single HTTPS link (WhatsApp, SMS, email)', async () => {
  const { calls, mod } = shareModule();
  assert.equal(await mod.shareStoryInvite('Summer in "Lahore"\nwith family', CODE), 'shared');
  assert.equal(calls.share.length, 1);
  const { content, options } = calls.share[0];
  assert.match(content.message, new RegExp(BASE.replace(/\./g, '\\.') + '/join/' + CODE + '$'), 'the link is the last line so every app makes it clickable');
  assert.equal(content.message.match(/https?:\/\//g).length, 1, 'exactly one link');
  assert.equal(content.message.includes('wholestory://'), false);
  assert.equal(content.message.includes('\t'), false);
  assert.ok(options.subject, 'email subject');
  assert.equal(content.url, undefined, 'no second url that WhatsApp would show twice');
});

test('closing the share sheet is reported as dismissed, not as an error', async () => {
  const { mod } = shareModule({ shareResult: { action: 'dismissedAction' } });
  assert.equal(await mod.shareStoryInvite('Trip', CODE), 'dismissed');
});

test('sharing says clearly when invitation links are not configured yet', async () => {
  const { calls, mod } = shareModule({ env: {} });
  await assert.rejects(mod.shareStoryInvite('Trip', CODE), /not configured/);
  assert.equal(calls.share.length, 0);
});

test('on the web the browser share sheet is used, and without one the invitation is copied', async () => {
  const shared = [];
  const withShare = shareModule({ os: 'web', navigator: { share: async data => { shared.push(data); } } });
  assert.equal(await withShare.mod.shareStoryInvite('Trip', CODE), 'shared');
  assert.match(shared[0].text, /\/join\/e84365e5ffc7$/);
  assert.equal(withShare.calls.copied.length, 0);

  const cancelled = shareModule({ os: 'web', navigator: { share: async () => { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; } } });
  assert.equal(await cancelled.mod.shareStoryInvite('Trip', CODE), 'dismissed');

  const without = shareModule({ os: 'web', navigator: {} });
  assert.equal(await without.mod.shareStoryInvite('Trip', CODE), 'copied');
  assert.match(without.calls.copied[0], /\/join\/e84365e5ffc7$/);
});

// ---------------------------------------------------------------- database: expiry and join_story

test('the invitation migration adds an expiry and separates "not valid" from "expired"', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261107_story_invite_expiry.sql'), 'utf8');
  assert.match(sql, /add column if not exists expires_at timestamptz/);
  assert.match(sql, /set default \(now\(\) \+ interval '30 days'\)/);
  assert.match(sql, /raise exception 'This invite link is not valid'/);
  assert.match(sql, /raise exception 'This invite link has expired'/);
  assert.match(sql, /invite_expires is not null and invite_expires <= now\(\)/, 'old invitations without an expiry keep working');
  assert.match(sql, /auth\.uid\(\) is null then raise exception 'Please sign in first'/);
  assert.match(sql, /security definer set search_path = public/);
  assert.match(sql, /revoke all on function public\.join_story\(text\) from public/);
  assert.match(sql, /grant execute on function public\.join_story\(text\) to authenticated/);
  // the messages the app classifies must be the messages the database raises
  assert.equal(flow.classifyJoinError(new Error('This invite link is not valid')).kind, 'invalid');
  assert.equal(flow.classifyJoinError(new Error('This invite link has expired')).kind, 'expired');
  assert.equal(flow.classifyJoinError(new Error('Please sign in first')).kind, 'signin');
});

// ---------------------------------------------------------------- Universal Links / App Links configuration

const assoc = require('./invite-association.cjs');
const APP_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;
const IDS = { bundleId: APP_JSON.ios.bundleIdentifier, packageName: APP_JSON.android.package };
// Made-up values with the right shape, used only to test the checks. Never put these in a real file.
const TEAM = 'ABCDE12345';
const FP = Array.from({ length: 32 }, (_, i) => (i * 7 % 256).toString(16).toUpperCase().padStart(2, '0')).join(':');

test('app.config.js turns the invitation website into an iOS associated domain and a verified Android link', () => {
  const run = env => {
    const previous = process.env.EXPO_PUBLIC_INVITE_BASE_URL;
    if (env === undefined) delete process.env.EXPO_PUBLIC_INVITE_BASE_URL; else process.env.EXPO_PUBLIC_INVITE_BASE_URL = env;
    try { return require(path.join(ROOT, 'app.config.js'))({ config: JSON.parse(JSON.stringify(APP_JSON)) }); }
    finally { if (previous === undefined) delete process.env.EXPO_PUBLIC_INVITE_BASE_URL; else process.env.EXPO_PUBLIC_INVITE_BASE_URL = previous; }
  };
  const config = run(BASE);
  assert.ok(config.ios.associatedDomains.includes('applinks:invite.test.example'));
  const filter = config.android.intentFilters.find(f => f.data.some(d => d.host === 'invite.test.example'));
  assert.equal(filter.autoVerify, true);
  assert.equal(filter.action, 'VIEW');
  assert.deepEqual(filter.category.sort(), ['BROWSABLE', 'DEFAULT']);
  assert.deepEqual(filter.data, [{ scheme: 'https', host: 'invite.test.example', pathPrefix: '/join/' }]);
  assert.deepEqual(assoc.validateExpoConfig({ baseUrl: BASE, loadConfig: () => config }), []);

  assert.equal(run(undefined).ios.associatedDomains, undefined, 'no website configured: no links, nothing invented');
  assert.throws(() => run('http://insecure.example'), /HTTPS/);
  assert.throws(() => run('https://invite.test.example/path'), /HTTPS/);
  assert.ok(assoc.validateExpoConfig({ baseUrl: '', loadConfig: () => ({}) })[0].match(/not set/));
  assert.ok(assoc.validateExpoConfig({ baseUrl: BASE, loadConfig: () => ({ scheme: 'x', ios: {}, android: {} }) }).length >= 2);
});

test('the iOS association file is built only from a real Team ID and matches the bundle ID', () => {
  const aasa = assoc.buildAasa({ teamId: TEAM, bundleId: IDS.bundleId });
  assert.deepEqual(aasa.applinks.details[0].appIDs, [TEAM + '.' + IDS.bundleId]);
  assert.equal(aasa.applinks.details[0].components[0]['/'], '/join/*');
  assert.deepEqual(assoc.validateAasa(aasa, IDS), []);
  for (const bad of [undefined, '', 'short', 'abcde12345', 'ABCDE123456', 'ABCDE 2345']) assert.throws(() => assoc.buildAasa({ teamId: bad, bundleId: IDS.bundleId }), /Team ID/);
  assert.ok(assoc.validateAasa({ applinks: { details: [{ appIDs: ['ABCDE12345.some.other.app'], components: [{ '/': '/join/*' }] }] } }, IDS)[0].match(/bundle ID/));
  assert.ok(assoc.validateAasa({ applinks: { details: [{ appIDs: [TEAM + '.' + IDS.bundleId], components: [{ '/': '/other/*' }] }] } }, IDS).join().match(/\/join\/\*/));
  assert.ok(assoc.validateAasa({ applinks: { details: [{ appIDs: ['REPLACE_WITH_APPLE_TEAM_ID.' + IDS.bundleId], components: [{ '/': '/join/*' }] }] } }, IDS)[0].match(/Team ID/), 'placeholders are rejected');
  assert.deepEqual(assoc.validateAasa({}, IDS), ['applinks.details is missing.']);
  // the older appID + paths layout is still understood
  assert.deepEqual(assoc.validateAasa({ applinks: { details: [{ appID: TEAM + '.' + IDS.bundleId, paths: ['/join/*'] }] } }, IDS), []);
});

test('the Android association file needs real SHA-256 fingerprints and matches the package name', () => {
  const links = assoc.buildAssetLinks({ packageName: IDS.packageName, fingerprints: [FP, FP] });
  assert.equal(links[0].target.package_name, IDS.packageName);
  assert.deepEqual(links[0].target.sha256_cert_fingerprints, [FP], 'duplicates removed');
  assert.deepEqual(assoc.validateAssetLinks(links, IDS), []);
  assert.throws(() => assoc.buildAssetLinks({ packageName: IDS.packageName, fingerprints: [] }), /at least one/);
  assert.throws(() => assoc.buildAssetLinks({ packageName: IDS.packageName, fingerprints: ['REPLACE_WITH_ANDROID_APP_SIGNING_SHA256_FINGERPRINT'] }), /fingerprint/);
  assert.throws(() => assoc.buildAssetLinks({ packageName: IDS.packageName, fingerprints: [FP.toLowerCase()] }), /fingerprint/);
  assert.deepEqual(assoc.parseFingerprints(' ' + FP.toLowerCase() + ' , ,' + FP), [FP, FP]);
  assert.ok(assoc.validateAssetLinks([], IDS)[0].match(/android_app/));
  assert.ok(assoc.validateAssetLinks({}, IDS)[0].match(/array/));
  assert.ok(assoc.validateAssetLinks([{ relation: [], target: { namespace: 'android_app', package_name: IDS.packageName, sha256_cert_fingerprints: [] } }], IDS).length >= 2);
});

test('the example files in docs match the format the tool generates', () => {
  const dir = path.join(ROOT, 'docs/invitations');
  const aasa = JSON.parse(fs.readFileSync(path.join(dir, 'apple-app-site-association.example.json'), 'utf8'));
  const links = JSON.parse(fs.readFileSync(path.join(dir, 'assetlinks.example.json'), 'utf8'));
  assert.equal(aasa.applinks.details[0].appIDs[0].endsWith('.' + IDS.bundleId), true);
  assert.equal(links[0].target.package_name, IDS.packageName);
  assert.match(aasa.applinks.details[0].appIDs[0], /REPLACE_WITH/, 'examples keep an obvious placeholder, never a guess');
  assert.match(links[0].target.sha256_cert_fingerprints[0], /REPLACE_WITH/);
});

function fakeFetch(routes) {
  return async url => {
    const route = routes[url.replace(BASE, '')];
    if (!route) throw new Error('connection refused');
    return { status: route.status ?? 200, headers: { get: name => (route.type && name.toLowerCase() === 'content-type' ? route.type : null) }, text: async () => route.body ?? '' };
  };
}

test('checking the live website: a correct deployment passes, broken ones are reported', async () => {
  const good = {
    '/.well-known/apple-app-site-association': { type: 'application/json', body: JSON.stringify(assoc.buildAasa({ teamId: TEAM, bundleId: IDS.bundleId })) },
    '/.well-known/assetlinks.json': { type: 'application/json', body: JSON.stringify(assoc.buildAssetLinks({ packageName: IDS.packageName, fingerprints: [FP] })) },
    '/join/abcdef123456': { type: 'text/html', body: '<html></html>' },
  };
  assert.deepEqual(await assoc.checkOnline(BASE, IDS, fakeFetch(good)), { problems: [], warnings: [] });

  const redirected = { ...good, '/.well-known/apple-app-site-association': { status: 301 } };
  assert.match((await assoc.checkOnline(BASE, IDS, fakeFetch(redirected))).problems.join(), /HTTP 301/);

  const noJoinPage = { ...good, '/join/abcdef123456': { status: 404 } };
  assert.match((await assoc.checkOnline(BASE, IDS, fakeFetch(noJoinPage))).problems.join(), /\/join\/CODE returned HTTP 404/);

  const brokenJson = { ...good, '/.well-known/assetlinks.json': { type: 'application/json', body: '{oops' } };
  assert.match((await assoc.checkOnline(BASE, IDS, fakeFetch(brokenJson))).problems.join(), /not valid JSON/);

  const wrongType = { ...good, '/.well-known/apple-app-site-association': { type: 'text/html', body: good['/.well-known/apple-app-site-association'].body } };
  assert.match((await assoc.checkOnline(BASE, IDS, fakeFetch(wrongType))).warnings.join(), /JSON content type/);

  const offline = await assoc.checkOnline(BASE, IDS, fakeFetch({}));
  assert.equal(offline.problems.length, 3, 'all three addresses unreachable');
});

test('the generate command refuses to write anything without real values', () => {
  const { spawnSync } = require('node:child_process');
  const out = path.join(require('node:os').tmpdir(), 'ws-assoc-' + process.pid);
  const run = env => spawnSync(process.execPath, [path.join(__dirname, 'invite-association.cjs'), 'generate', '--out', out], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  const none = run({});
  assert.equal(none.status, 2);
  assert.match(none.stderr, /APPLE_TEAM_ID, ANDROID_SHA256_FINGERPRINTS/);
  assert.equal(fs.existsSync(out), false);
  const placeholder = run({ APPLE_TEAM_ID: 'REPLACE_WITH_APPLE_TEAM_ID', ANDROID_SHA256_FINGERPRINTS: FP });
  assert.equal(placeholder.status, 2);
  assert.equal(fs.existsSync(out), false);
  const ok = run({ APPLE_TEAM_ID: TEAM, ANDROID_SHA256_FINGERPRINTS: FP });
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(assoc.validateAasa(JSON.parse(fs.readFileSync(path.join(out, 'apple-app-site-association'), 'utf8')), IDS), []);
  assert.deepEqual(assoc.validateAssetLinks(JSON.parse(fs.readFileSync(path.join(out, 'assetlinks.json'), 'utf8')), IDS), []);
  fs.rmSync(out, { recursive: true, force: true });
});
