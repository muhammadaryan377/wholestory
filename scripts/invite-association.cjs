#!/usr/bin/env node
/*
 * Universal Links (iOS) and App Links (Android) helper for Whole Story invitations.
 *
 *   node scripts/invite-association.cjs generate   writes the two association files from real values
 *   node scripts/invite-association.cjs validate   checks the app config, the files and (optionally) the live website
 *
 * Nothing here is invented: the Apple Team ID and the Android signing fingerprint(s) must be supplied
 * through the environment, and "generate" refuses to write anything without them.
 *
 *   APPLE_TEAM_ID                10 characters, from https://developer.apple.com/account (Membership details)
 *   ANDROID_SHA256_FINGERPRINTS  comma separated SHA-256 signing certificate fingerprints, AA:BB:...:FF
 *                                (EAS: `eas credentials`; Google Play: Setup > App signing)
 *   EXPO_PUBLIC_INVITE_BASE_URL  the verified HTTPS website that serves /join/CODE
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TEAM_ID = /^[A-Z0-9]{10}$/;
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const JOIN_PATH = '/join/*';

function readAppIds(appJsonPath = path.join(ROOT, 'app.json')) {
  const expo = JSON.parse(fs.readFileSync(appJsonPath, 'utf8')).expo || {};
  return { bundleId: expo.ios && expo.ios.bundleIdentifier, packageName: expo.android && expo.android.package, scheme: expo.scheme };
}

const validateTeamId = value => typeof value === 'string' && TEAM_ID.test(value);
const validateFingerprint = value => typeof value === 'string' && FINGERPRINT.test(value);

function parseFingerprints(raw) {
  return String(raw || '').split(',').map(item => item.trim().toUpperCase()).filter(Boolean);
}

function buildAasa({ teamId, bundleId }) {
  if (!validateTeamId(teamId)) throw new Error('APPLE_TEAM_ID must be the 10-character Apple Team ID (capital letters and digits).');
  if (!bundleId) throw new Error('ios.bundleIdentifier is missing in app.json.');
  return {
    applinks: {
      apps: [],
      details: [{ appIDs: [teamId + '.' + bundleId], components: [{ '/': JOIN_PATH, comment: 'Whole Story story invitations' }] }],
    },
  };
}

function buildAssetLinks({ packageName, fingerprints }) {
  if (!packageName) throw new Error('android.package is missing in app.json.');
  const list = fingerprints || [];
  if (!list.length) throw new Error('ANDROID_SHA256_FINGERPRINTS must contain at least one signing certificate fingerprint.');
  const bad = list.filter(value => !validateFingerprint(value));
  if (bad.length) throw new Error('Not a SHA-256 fingerprint (expected 32 hex pairs like AA:BB:...): ' + bad.join(', '));
  return [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: [...new Set(list)] },
  }];
}

/** Returns a list of problems; an empty list means the file looks right. */
function validateAasa(json, { bundleId } = {}) {
  const problems = [];
  const details = json && json.applinks && json.applinks.details;
  if (!Array.isArray(details) || !details.length) return ['applinks.details is missing.'];
  const joinCovered = [];
  for (const entry of details) {
    const ids = Array.isArray(entry.appIDs) ? entry.appIDs : entry.appID ? [entry.appID] : [];
    if (!ids.length) problems.push('A details entry has no appIDs.');
    for (const id of ids) {
      const dot = String(id).indexOf('.');
      const team = dot > 0 ? id.slice(0, dot) : '';
      if (!validateTeamId(team)) problems.push('appID "' + id + '" does not start with a valid 10-character Team ID.');
      if (bundleId && id.slice(dot + 1) !== bundleId) problems.push('appID "' + id + '" does not match the app bundle ID ' + bundleId + '.');
    }
    const paths = (entry.components || []).map(component => component && component['/']).concat(entry.paths || []);
    joinCovered.push(paths.some(value => value === JOIN_PATH || value === '/join/*' || value === '*'));
  }
  if (!joinCovered.some(Boolean)) problems.push('No entry allows ' + JOIN_PATH + '.');
  return problems;
}

function validateAssetLinks(json, { packageName } = {}) {
  const problems = [];
  if (!Array.isArray(json)) return ['assetlinks.json must be a JSON array.'];
  const match = json.find(item => item && item.target && item.target.namespace === 'android_app' && (!packageName || item.target.package_name === packageName));
  if (!match) return ['No android_app entry' + (packageName ? ' for package ' + packageName : '') + '.'];
  if (!Array.isArray(match.relation) || !match.relation.includes('delegate_permission/common.handle_all_urls')) problems.push('relation must include delegate_permission/common.handle_all_urls.');
  const prints = match.target.sha256_cert_fingerprints;
  if (!Array.isArray(prints) || !prints.length) problems.push('sha256_cert_fingerprints is empty.');
  else for (const value of prints) if (!validateFingerprint(value)) problems.push('Invalid fingerprint: ' + value);
  return problems;
}

/**
 * Checks that app.config.js turns the configured invitation website into an iOS associated domain and an
 * Android verified App Link for /join/ — exactly what must be present in the built apps.
 */
function validateExpoConfig({ baseUrl, loadConfig }) {
  const problems = [];
  if (!baseUrl) return ['EXPO_PUBLIC_INVITE_BASE_URL is not set, so the built apps will have no universal/app links.'];
  let host;
  try { host = new URL(baseUrl).hostname; } catch { return ['EXPO_PUBLIC_INVITE_BASE_URL is not a valid URL.']; }
  let config;
  try { config = loadConfig(baseUrl); } catch (error) { return ['app.config.js rejected the address: ' + error.message]; }
  const domains = (config.ios && config.ios.associatedDomains) || [];
  if (!domains.includes('applinks:' + host)) problems.push('ios.associatedDomains is missing applinks:' + host + '.');
  const filters = (config.android && config.android.intentFilters) || [];
  const ok = filters.some(filter => filter.autoVerify === true && filter.action === 'VIEW' &&
    (filter.category || []).includes('BROWSABLE') && (filter.category || []).includes('DEFAULT') &&
    (filter.data || []).some(data => data.scheme === 'https' && data.host === host && data.pathPrefix === '/join/'));
  if (!ok) problems.push('android.intentFilters has no verified https://' + host + '/join/ filter.');
  if (!config.scheme) problems.push('"scheme" is missing in app.json.');
  return problems;
}

function loadExpoConfig(baseUrl) {
  const previous = process.env.EXPO_PUBLIC_INVITE_BASE_URL;
  process.env.EXPO_PUBLIC_INVITE_BASE_URL = baseUrl;
  try {
    const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;
    return require(path.join(ROOT, 'app.config.js'))({ config: app });
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_INVITE_BASE_URL; else process.env.EXPO_PUBLIC_INVITE_BASE_URL = previous;
  }
}

/** Fetches the live website. Association files must be served directly (no redirect) as JSON. */
async function checkOnline(origin, ids, fetchImpl = fetch, sampleCode = 'abcdef123456') {
  const problems = [];
  const warnings = [];
  async function get(url, name) {
    try { return await fetchImpl(url, { redirect: 'manual' }); }
    catch (error) { problems.push(name + ': could not be reached (' + error.message + ').'); return null; }
  }
  const aasa = await get(origin + '/.well-known/apple-app-site-association', 'apple-app-site-association');
  if (aasa) {
    if (aasa.status !== 200) problems.push('apple-app-site-association returned HTTP ' + aasa.status + ' (must be 200 with no redirect).');
    else {
      if (!/json/i.test(aasa.headers.get('content-type') || '')) warnings.push('apple-app-site-association is not served with a JSON content type.');
      try { problems.push(...validateAasa(JSON.parse(await aasa.text()), ids).map(item => 'apple-app-site-association: ' + item)); }
      catch { problems.push('apple-app-site-association is not valid JSON.'); }
    }
  }
  const links = await get(origin + '/.well-known/assetlinks.json', 'assetlinks.json');
  if (links) {
    if (links.status !== 200) problems.push('assetlinks.json returned HTTP ' + links.status + ' (must be 200 with no redirect).');
    else {
      try { problems.push(...validateAssetLinks(JSON.parse(await links.text()), { packageName: ids.packageName }).map(item => 'assetlinks.json: ' + item)); }
      catch { problems.push('assetlinks.json is not valid JSON.'); }
    }
  }
  const page = await get(origin + '/join/' + sampleCode, 'join page');
  if (page && page.status !== 200) problems.push('/join/CODE returned HTTP ' + page.status + '. The website must serve the invitation page for every code.');
  return { problems, warnings };
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index > -1 ? process.argv[index + 1] : undefined;
}

function generate() {
  const ids = readAppIds();
  const out = path.resolve(ROOT, argValue('--out') || 'public/.well-known');
  const missing = [];
  if (!process.env.APPLE_TEAM_ID) missing.push('APPLE_TEAM_ID');
  if (!process.env.ANDROID_SHA256_FINGERPRINTS) missing.push('ANDROID_SHA256_FINGERPRINTS');
  if (missing.length) {
    console.error('Cannot generate the association files. Missing: ' + missing.join(', ') + '.\nThese must be your real values; they are never guessed.');
    process.exit(2);
  }
  let aasa; let assetlinks;
  try {
    aasa = buildAasa({ teamId: process.env.APPLE_TEAM_ID, bundleId: ids.bundleId });
    assetlinks = buildAssetLinks({ packageName: ids.packageName, fingerprints: parseFingerprints(process.env.ANDROID_SHA256_FINGERPRINTS) });
  } catch (error) { console.error(error.message); process.exit(2); }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'apple-app-site-association'), JSON.stringify(aasa, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'assetlinks.json'), JSON.stringify(assetlinks, null, 2) + '\n');
  console.log('Wrote ' + out + '/apple-app-site-association and assetlinks.json');
  console.log('Serve them at https://YOUR-DOMAIN/.well-known/ over HTTPS, without redirects, then run: node scripts/invite-association.cjs validate --online');
}

async function validate() {
  const strict = process.argv.includes('--strict');
  const online = process.argv.includes('--online');
  const ids = readAppIds();
  const baseUrl = process.env.EXPO_PUBLIC_INVITE_BASE_URL;
  const problems = [];
  const notes = [];
  if (!ids.bundleId) problems.push('ios.bundleIdentifier is missing in app.json.');
  if (!ids.packageName) problems.push('android.package is missing in app.json.');
  if (!baseUrl) notes.push('EXPO_PUBLIC_INVITE_BASE_URL is not set: invitation links, Universal Links and App Links are NOT configured yet.');
  else problems.push(...validateExpoConfig({ baseUrl, loadConfig: loadExpoConfig }));

  const dir = path.resolve(ROOT, argValue('--files') || 'public/.well-known');
  const aasaFile = path.join(dir, 'apple-app-site-association');
  const linksFile = path.join(dir, 'assetlinks.json');
  if (fs.existsSync(aasaFile)) problems.push(...validateAasa(JSON.parse(fs.readFileSync(aasaFile, 'utf8')), ids).map(item => 'apple-app-site-association: ' + item));
  else notes.push('No ' + path.relative(ROOT, aasaFile) + ' yet (run "generate" with your Apple Team ID).');
  if (fs.existsSync(linksFile)) problems.push(...validateAssetLinks(JSON.parse(fs.readFileSync(linksFile, 'utf8')), { packageName: ids.packageName }).map(item => 'assetlinks.json: ' + item));
  else notes.push('No ' + path.relative(ROOT, linksFile) + ' yet (run "generate" with your Android signing fingerprint).');

  if (online) {
    if (!baseUrl) problems.push('--online needs EXPO_PUBLIC_INVITE_BASE_URL.');
    else {
      const result = await checkOnline(new URL(baseUrl).origin, ids);
      problems.push(...result.problems);
      notes.push(...result.warnings);
    }
  }
  notes.forEach(note => console.log('NOTE    ' + note));
  problems.forEach(problem => console.log('PROBLEM ' + problem));
  if (!problems.length && !notes.length) console.log('OK: invitation link configuration looks complete.');
  else if (!problems.length) console.log('No problems found, but setup is not finished (see the notes above).');
  process.exit(problems.length || (strict && notes.length) ? 1 : 0);
}

module.exports = {
  readAppIds, validateTeamId, validateFingerprint, parseFingerprints, buildAasa, buildAssetLinks,
  validateAasa, validateAssetLinks, validateExpoConfig, checkOnline,
};

if (require.main === module) {
  const command = process.argv[2];
  if (command === 'generate') generate();
  else if (command === 'validate') validate().catch(error => { console.error(error); process.exit(1); });
  else { console.error('Usage: node scripts/invite-association.cjs generate | validate [--online] [--strict] [--files DIR]'); process.exit(2); }
}
