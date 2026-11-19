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
  `Monty ${version.versionName}\n\n${version.notes}\n\n[Download Monty for Android](${mobileOrigin})\n\n**Update an existing Monty installation**\n\nUse **Monty → Settings → Updates**, or download the **Universal APK** and open it in **Files → Downloads**. Choose Android's **Package installer** if prompted and tap **Update**. Keep Monty installed to retain your library and progress. If SAI opens automatically, clear its defaults in **Android Settings → Apps → SAI → Open by default**, then reopen the APK from Files. Android may ask you to allow installation from Files.\n\n**Connect your library**\n\nIn the web app open **Settings → Connect Android** and create a one-time code. Enter it in Monty under **Settings → Sync with your web library**. Existing phone data is merged.\n\nOfficial releases share one signing key. If an older USB-installed copy used a different key, keep that copy and back up its library before migrating.\n`,
);
console.log(
  `Packaged Monty ${version.versionName}: universal and arm64-v8a APKs, checksums, and update.json.`,
);
