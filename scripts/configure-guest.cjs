const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const values = {};
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*(EXPO_PUBLIC_SUPABASE_(?:URL|ANON_KEY))\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || values.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || values.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
if (!/^https?:\/\/[^/]+$/.test(url) || !key || /YOUR-/i.test(url + key) || key.startsWith('sb_secret_')) throw new Error('Set the real Supabase project URL and public key in .env first.');
if (key.split('.').length === 3) {
  const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
  if (payload.role !== 'anon') throw new Error('Guest pages require the anon key, never a service-role key.');
}
fs.writeFileSync(path.join(root, 'guest-web/config.js'), `window.WHOLESTORY_CONFIG = ${JSON.stringify({ url, key })};\n`);
console.log('Guest page configured with public client credentials. No values were printed.');
