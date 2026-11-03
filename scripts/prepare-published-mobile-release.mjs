import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
// Retry distribution using the immutable, already-tested GitHub APKs. Never
// rebuild the same release version or replace it with a different binary.
const manifest = JSON.parse(await readFile('release/update.json', 'utf8'));
if (manifest.applicationId !== 'com.monty.study' || !/^\d+\.\d+\.\d+$/.test(manifest.versionName))
  throw new Error('Invalid published release');
for (const abi of ['arm64-v8a', 'universal']) {
  const name = `Monty-${manifest.versionName}-${abi}.apk`;
  const bytes = await readFile('release/' + name);
  const asset = manifest.packages?.[abi];
  if (!asset || bytes.length !== asset.size || createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
    throw new Error('Published APK checksum or size mismatch');
  asset.url = `https://monty-mobile.fuzzygenet512.chatgpt.site/downloads/${manifest.versionName}/${name}`;
}
await writeFile('release/mobile-update.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('Verified immutable GitHub APKs for mobile distribution.');
