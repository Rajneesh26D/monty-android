import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const version = JSON.parse(await readFile('android-version.json', 'utf8'));
const mobileOrigin = 'https://monty-mobile.fuzzygenet512.chatgpt.site';
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
  resolve(directory, 'mobile-update.json'),
  JSON.stringify(
    {
      schemaVersion: 1,
      applicationId: 'com.monty.study',
      ...version,
      minSdk: 24,
      targetSdk: 36,
      packages: Object.fromEntries(
        Object.entries(packages).map(([abi, apk]) => [
          abi,
          {
            ...apk,
            url: `${mobileOrigin}/downloads/${version.versionName}/Monty-${version.versionName}-${abi}.apk`,
          },
        ]),
      ),
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
  `Monty ${version.versionName}\n\n${version.notes}\n\n[Download Monty for Android](${mobileOrigin}) — no USB or laptop script is needed. Choose **arm64-v8a** for a modern 64-bit phone, or **universal** if unsure. Both target Android 16 and support Android 7+.\n\n**Connect your library:** In the web app open Settings → Connect Android and create a one-time code. Enter it in the phone's Settings → Sync with your web library. Both then use the same private backend. Existing phone data is preserved and merged.\n\nOpen **Settings → Updates** for later APK updates. Enable **App updates** under Notifications for background alerts. Android asks you to approve installation.\n\nThe reconstructed release line uses com.monty.study and a stable signing key. If the old USB-installed app uses another package or key, export a ZIP backup before migrating. Keep the old app until its data has been transferred.\n`,
);
console.log(
  `Packaged Monty ${version.versionName}: universal and arm64-v8a APKs, checksums, and update.json.`,
);
