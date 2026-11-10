// Account-level onboarding state and routing, run against an in-memory server and device storage.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

function load(file, mocks) {
  const module = { exports: {} };
  const output = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, {
    module, exports: module.exports, console, Date,
    require(name) { if (name in mocks) return mocks[name]; throw new Error(`Unexpected dependency ${name}`); },
  }, { filename: file });
  return module.exports;
}

const memoryDevice = () => {
  const items = new Map();
  return { items, api: { __esModule: true, default: {
    getItem: async key => items.get(key) ?? null,
    setItem: async (key, value) => { items.set(key, value); },
    removeItem: async key => { items.delete(key); },
    multiSet: async pairs => pairs.forEach(([key, value]) => items.set(key, value)),
    multiRemove: async keys => keys.forEach(key => items.delete(key)),
  } } };
};

function server({ rows = {}, metadata = {} } = {}) {
  const state = { rows, metadata, offline: false, missingTable: false, writes: 0 };
  const failure = () => state.offline ? { message: 'Network request failed' } : state.missingTable ? { code: 'PGRST205', message: 'missing' } : null;
  state.supabase = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: state.currentUser, user_metadata: state.metadata[state.currentUser] ?? {} } } } }),
      updateUser: async ({ data }) => { state.metadata[state.currentUser] = { ...state.metadata[state.currentUser], ...data }; return { data: {}, error: null }; },
    },
    from: () => {
      let id;
      const query = {
        select: () => query,
        eq: (_key, value) => { id = value; return query; },
        maybeSingle: async () => ({ data: failure() ? null : state.rows[id] ?? null, error: failure() }),
        upsert: async payload => {
          if (failure()) return { error: failure() };
          state.writes += 1;
          const { user_id: userId, ...patch } = payload;
          state.rows[userId] = { current_step: 'profile', completed_at: null, ...state.rows[userId], ...patch };
          return { error: null };
        },
      };
      return query;
    },
  };
  return state;
}

function appOn(device, backend, userId) {
  backend.currentUser = userId;
  return load('lib/onboarding.ts', { '@react-native-async-storage/async-storage': device.api, './supabase': { supabase: backend.supabase } });
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const DONE = { current_step: 'plan', completed_at: '2026-11-01T00:00:00Z' };

for (const provider of ['email', 'google', 'apple']) {
  test(`existing ${provider} account goes straight to Home on a new device`, async () => {
    const device = memoryDevice();
    const backend = server({ rows: { [provider]: { ...DONE } } });
    assert.equal((await appOn(device, backend, provider).readOnboardingState(provider)).done, true);
    assert.equal(device.items.get('ws_onboarded_' + provider), '1');
  });
}

test('a new account starts at the first step and is not let in on a failed check', async () => {
  const backend = server();
  const app = appOn(memoryDevice(), backend, 'new');
  assert.deepEqual({ ...(await app.readOnboardingState('new')) }, { done: false, step: 0 });
  backend.offline = true;
  await assert.rejects(app.readOnboardingState('new'), error => /Network/.test(error.message));
});

test('interrupted setup resumes from the saved step on restart, reinstall and another device', async () => {
  const backend = server();
  const first = memoryDevice();
  const app = appOn(first, backend, 'user');
  await app.saveOnboardingStep('user', 2);
  assert.equal((await appOn(first, backend, 'user').readOnboardingState('user')).step, 2, 'restart');
  const state = await appOn(memoryDevice(), backend, 'user').readOnboardingState('user');
  assert.deepEqual({ ...state }, { done: false, step: 2 }, 'reinstall or another device');
});

test('finishing setup survives logout, login, reinstall and another device', async () => {
  const backend = server();
  const phone = memoryDevice();
  await appOn(phone, backend, 'user').markSetupComplete('user');
  assert.ok(backend.rows.user.completed_at);
  assert.equal((await appOn(phone, backend, 'user').readOnboardingState('user')).done, true, 'logging back in');
  backend.metadata = {};
  assert.equal((await appOn(memoryDevice(), backend, 'user').readOnboardingState('user')).done, true, 'server row alone is enough');
});

test('a later step change cannot reopen a finished account', async () => {
  const backend = server();
  const app = appOn(memoryDevice(), backend, 'user');
  await app.markSetupComplete('user');
  await app.saveOnboardingStep('user', 1);
  assert.ok(backend.rows.user.completed_at);
});

test('finishing offline lets the person in and reaches the server on a later launch', async () => {
  const backend = server();
  const phone = memoryDevice();
  backend.offline = true;
  await appOn(phone, backend, 'user').markSetupComplete('user');
  assert.equal((await appOn(phone, backend, 'user').readOnboardingState('user')).done, true);
  assert.equal(backend.rows.user, undefined);
  backend.offline = false;
  await appOn(phone, backend, 'user').readOnboardingState('user');
  await flush();
  assert.ok(backend.rows.user.completed_at);
  const writes = backend.writes;
  await appOn(phone, backend, 'user').readOnboardingState('user');
  await flush();
  assert.equal(backend.writes, writes, 'no repeat writes once synced');
});

test('accounts finished on an older app version are carried over without another setup', async () => {
  const fromMetadata = server({ metadata: { old: { setup_complete: true } } });
  assert.equal((await appOn(memoryDevice(), fromMetadata, 'old').readOnboardingState('old')).done, true);
  await flush();
  assert.ok(fromMetadata.rows.old.completed_at);

  const device = memoryDevice();
  device.items.set('ws_onboarded_local', '1');
  const fromDevice = server();
  assert.equal((await appOn(device, fromDevice, 'local').readOnboardingState('local')).done, true);
  await flush();
  assert.ok(fromDevice.rows.local.completed_at);
});

test('one account finishing does not skip setup for another account on the same phone', async () => {
  const backend = server();
  const phone = memoryDevice();
  await appOn(phone, backend, 'first').markSetupComplete('first');
  phone.items.set('ws_onboarded', '1'); // the old device-wide flag
  assert.equal((await appOn(phone, backend, 'second').readOnboardingState('second')).done, false);
});

test('before the migration runs, the app keeps working from what the device knows', async () => {
  const backend = server();
  backend.missingTable = true;
  const device = memoryDevice();
  assert.deepEqual({ ...(await appOn(device, backend, 'user').readOnboardingState('user')) }, { done: false, step: 0 });
  device.items.set('ws_onboarded', '1');
  assert.equal((await appOn(device, backend, 'user').readOnboardingState('user')).done, true);
});

test('routing sends every login through one gate and never guesses', () => {
  for (const file of ['app/sign-in.tsx', 'components/social-auth-buttons.tsx', 'app/auth/callback.tsx']) assert.match(read(file), /router\.replace\('\/'\)/, file);
  for (const file of ['app/index.tsx', 'app/(tabs)/_layout.tsx']) {
    const source = read(file);
    assert.match(source, /useOnboardingGate\(/, file);
    assert.match(source, /gate\.status === 'error'\) return <LoadError/, file);
    assert.match(source, /gate\.status === 'needed'\) return <Redirect href="\/onboarding"/, file);
  }
  assert.doesNotMatch(read('lib/use-onboarding-gate.ts'), /status: 'done', error/, 'failures are not reported as done');
});

test('every onboarding step has a working back action and keeps its answers', () => {
  const source = read('app/onboarding.tsx');
  assert.doesNotMatch(source, /step === 0 && !editor/, 'back stays visible on the first step');
  assert.match(source, /addEventListener\('hardwareBackPress', \(\) => \{ goBack\(\); return true; \}\)/);
  assert.match(source, /onPress=\{goBack\}/);
  assert.match(source, /step === 0\) \{ leaveSetup\(\)/);
  assert.match(source, /if \(state\.done\) \{ router\.replace\('\/'\)/, 'a finished account cannot re-enter setup');
  assert.match(source, /if \(photoAccess\) \{ goToStep\(2\); return; \}/, 'returning keeps reviewed moments');
  assert.match(source, /if \(photoAccess\) await saveNamedMoments/, 'resuming does not erase moments');
  assert.doesNotMatch(source, /setStep\((?:previous|1\)|3\))/, 'every forward or back move is saved');
});

function photoApp({ local = null, remote, uploadFails = false } = {}) {
  const device = memoryDevice();
  if (local) device.items.set('ws_profile_photo_user', local);
  const calls = { uploads: 0, saved: [], downloads: 0 };
  const file = {
    documentDirectory: 'file:///docs/',
    getInfoAsync: async () => ({ exists: true }),
    deleteAsync: async () => {},
    downloadAsync: async (_url, to) => { calls.downloads += 1; return { uri: to }; },
  };
  const photo = load('lib/profile-photo.ts', {
    'react-native': { Platform: { OS: 'android' } },
    '@react-native-async-storage/async-storage': device.api,
    'expo-image-picker': {}, 'expo-image-manipulator': {}, 'expo-file-system/legacy': file,
    './api': { saveAvatarPath: async value => { calls.saved.push(value); } },
    './media': { uploadFile: async () => { calls.uploads += 1; if (uploadFails) throw new Error('offline'); return 'user/new.jpg'; } },
    './onboarding': { isMissingSchema: () => false, readProfileSetup: async () => { if (remote === 'error') throw new Error('offline'); return { avatar_path: remote ?? null }; } },
    './supabase': { supabase: { storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://signed' }, error: null }), remove: async () => ({}) }) } } },
  });
  return { photo, device, calls };
}

test('a profile photo from the account appears on a new device', async () => {
  const { photo, calls } = photoApp({ remote: 'user/a.jpg' });
  assert.equal(await photo.readLocalProfilePhoto('user'), 'file:///docs/ws-profile-user.jpg');
  assert.equal(calls.downloads, 1);
});

test('a photo from before accounts stored them stays on the device and is not uploaded', async () => {
  const { photo, calls, device } = photoApp({ local: 'file:///docs/old.jpg' });
  assert.equal(await photo.readLocalProfilePhoto('user'), 'file:///docs/old.jpg');
  assert.equal(calls.uploads, 0);
  assert.equal(device.items.get('ws_profile_photo_user'), 'file:///docs/old.jpg');
});

test('a failed photo upload is retried, and a photo removed elsewhere is removed here', async () => {
  const pending = photoApp({ local: 'file:///docs/p.jpg', uploadFails: true });
  pending.device.items.set('ws_profile_photo_pending_user', '1');
  assert.equal(await pending.photo.syncPendingProfilePhoto('user'), false);
  assert.equal(pending.device.items.get('ws_profile_photo_pending_user'), '1');
  const synced = photoApp({ local: 'file:///docs/p.jpg' });
  synced.device.items.set('ws_profile_photo_pending_user', '1');
  assert.equal(await synced.photo.syncPendingProfilePhoto('user'), true);
  assert.deepEqual(synced.calls.saved, ['user/new.jpg']);
  assert.equal(await synced.photo.readLocalProfilePhoto('user'), null, 'remote is empty but this device had synced');
});

test('profile details are never read directly from columns hidden from co-members', () => {
  const migration = read('supabase/migrations/20261110_onboarding_progress.sql');
  assert.doesNotMatch(read('lib/onboarding.ts'), /from\('profiles'\)/);
  assert.match(migration, /my_profile_setup/);
  assert.doesNotMatch(migration, /\bdelete from\b(?! auth)/i, 'the migration deletes no data');
});
