import { readFile } from 'node:fs/promises';
const manifest = JSON.parse(await readFile('release/mobile-update.json', 'utf8'));
const origin = 'https://monty-mobile.fuzzygenet512.chatgpt.site';
const token = process.env.MONTY_UPLOAD_TOKEN;
if (!token) throw new Error('The signing setup must include the mobile release upload credential.');
const headers = { Authorization: 'Bearer ' + token };
if (process.env.MONTY_GATEWAY_AUTH)
  headers['OAI-Sites-Authorization'] = 'Bearer ' + process.env.MONTY_GATEWAY_AUTH;
const existing = await fetch(origin + '/updates/latest.json', { headers, redirect: 'error' });
if (existing.ok && (await existing.json()).versionCode >= manifest.versionCode) {
  console.log(
    'This version or a newer version is already published on the mobile download service.',
  );
  process.exit(0);
}
for (const [local, remote] of [
  ...['arm64-v8a', 'universal'].map((abi) => [
    `Monty-${manifest.versionName}-${abi}.apk`,
    `Monty-${manifest.versionName}-${abi}.apk`,
  ]),
  ['mobile-update.json', 'update.json'],
  ['SHA256SUMS.txt', 'SHA256SUMS.txt'],
]) {
  const bytes = await readFile('release/' + local);
  const response = await fetch(`${origin}/admin/releases/${manifest.versionName}/${remote}`, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.length),
    },
    body: bytes,
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Mobile release upload failed (' + response.status + ').');
}
const result = await fetch(origin + '/admin/publish', {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ version: manifest.versionName }),
  redirect: 'error',
});
if (!result.ok)
  throw new Error('Could not publish the complete mobile release (' + result.status + ').');
console.log('Published Monty ' + manifest.versionName + ' at ' + origin);
