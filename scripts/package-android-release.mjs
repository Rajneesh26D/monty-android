import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const version = JSON.parse(await readFile('android-version.json', 'utf8'));
const repository = process.env.GITHUB_REPOSITORY || 'Rajneesh26D/monty-android';
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid repository');
if (
  !Number.isSafeInteger(version.versionCode) ||
  version.versionCode <= 0 ||
  !/^\d+\.\d+\.\d+$/.test(version.versionName)
)
  throw new Error('Invalid Android version');
const directory = resolve('release');
await mkdir(directory, { recursive: true });
const packages = {};
for (const abi of ['universal', 'arm64-v8a']) {
  const name = `Monty-${version.versionName}-${abi}.apk`;
  const source = resolve('android/app/build/outputs/apk/release', `app-${abi}-release.apk`);
  const bytes = await readFile(source);
  await copyFile(source, resolve(directory, name));
  packages[abi] = {
    url: `https://github.com/${repository}/releases/download/v${version.versionName}/${name}`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
  };
}
await writeFile(
  resolve(directory, 'update.json'),
  JSON.stringify(
    {
      schemaVersion: 1,
      applicationId: 'com.monty.study',
      ...version,
      minSdk: 24,
      targetSdk: 36,
      packages,
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  resolve(directory, 'SHA256SUMS.txt'),
  Object.entries(packages)
    .map(([abi, apk]) => `${apk.sha256}  Monty-${version.versionName}-${abi}.apk`)
    .join('\n') + '\n',
);
await writeFile(
  resolve(directory, 'release-notes.md'),
  `Monty ${version.versionName}\n\n${version.notes}\n\nChoose **arm64-v8a** for a modern 64-bit Android phone. Choose **universal** if you are unsure. Both builds target Android 16 (API 36), and support Android 7+.\n\nAfter this initial installation, open **Settings → Updates** to check and install later releases. Enable **App updates** under Notifications for background update alerts. Android asks you to approve APK installations.\n\nThis is a new signed Android release line (com.monty.study). Export a ZIP backup from the previous Monty app before migrating; restore it in this app if the older app uses another package or signing key. Do not uninstall the older app before keeping a backup. Future releases use the same signing key and preserve this app’s data.\n`,
);
console.log(
  `Packaged Monty ${version.versionName}: universal and arm64-v8a APKs, checksums, and update.json.`,
);
