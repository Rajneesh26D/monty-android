# Monty Android

Monty is an English and Maths study app. The app packages the React/TypeScript
study interface in Capacitor 8, stores the study manifest in native SQLite,
keeps source PDFs in app-private files, and stores attachment banks, clocks,
and resumable import jobs in IndexedDB. Device backend tokens use Android
Keystore encryption. No library, source PDFs, AI key, or signing key belongs
in a public repository or release.

## Install

Download an APK from https://github.com/Rajneesh26D/monty-android/releases/latest.
Use **arm64-v8a** for a modern 64-bit Android phone, or **universal** if unsure.
Both target Android 16 / API 36 and support Android 7 / API 24 onward.
Android may ask you to allow installation from your browser or file manager.

The old USB-installed Android project and signing key were not in the saved
Sites repository. This release uses the new package `com.monty.study` and a
stable release key. Before migrating, export a backup from the old app.
Restore the ZIP under Settings → Backup & restore in the new app. Keep the
old app until the restored library has been checked. If the old app has the
same package with another key, Android cannot replace it; keep a backup
before uninstalling it. Later releases of this app retain its package and key.

The Android app opens its own on-device library. It does not automatically
log in to the private Sites web app or sync its cloud library. ZIP backup and
restore transfers existing study material. Existing deterministic PDF parsing,
practice, quizzes, notes, bookmarks, and results work on the device. The
existing vocabulary backend pairing interface is retained; general AI imports
currently require the hosted web app. A GitHub APK release does not deploy or
replace the private Sites backend.

## Updates and notifications

Settings → Updates shows the installed version, checks the latest public
GitHub release, and downloads the matching APK. Before opening Android's
installer the native updater validates metadata, exact download size, SHA-256,
package name, higher versionCode, versionName, and the installed signing
certificate. Failed checks delete the partial APK and leave study data alone.
Android asks you to allow installation from Monty and confirm the update.
An ordinary sideloaded app cannot silently install its own update.

Settings → Notifications → App updates requests notification permission and
starts one WorkManager task with a connected-network constraint. It checks
about every six hours, survives reboot, and sends one notification per new
version. Tapping it opens update settings. Checks also run at launch and on
foreground, throttled to hourly; manual checks are immediate. Notifications
are optional and off until enabled. Android battery rules, force-stop, no
network, and notification/channel settings can delay or suppress alerts.
These are local release-check notifications, not a Firebase push service.

## Release a change

1. Make and review code changes.
2. Increase **both** `versionCode` and `versionName` in `android-version.json`;
   write the release description in `notes`.
3. Push to `main`. The Android APK release workflow installs dependencies and
   SDK licenses, runs checks and native tests/lint, signs both APKs, verifies
   the signatures/alignment, and publishes APKs, checksums, and `update.json`.
4. Existing installations see the higher version during their next check.

Rebuilding the same version uploads workflow artifacts without overwriting
an existing release. Releases are drafted with all assets before publication,
so the app never sees a half-uploaded update. Failed draft releases should
be removed before retrying their version.

## Signing setup (one time)

Repository Settings → Secrets and variables → Actions needs a secret named
`MONTY_SIGNING_KEY`. Its value is the short private unlock code supplied to
the owner. The repository contains an authenticated AES-256-GCM encrypted
signing backup at `.github/signing/monty-release.enc.json`. It cannot be used
without that code. `scripts/restore-android-signing.mjs` decrypts the existing
release key inside the runner, masks credentials, and removes the temporary
key after the job. Keep the unlock code privately: it is needed to recover
the release key if the development workspace is lost. Never publish the code
or an unencrypted signing key. Do not generate another key for an installed
release. An existing `MONTY_SIGNING_BUNDLE` JSON secret is also supported.

## Local build

Use Node 22+, Java 21, Android SDK platform 36 and build-tools 36.0.0.

```sh
npm ci
npm run check
npm run android:sync
cd android
./gradlew testDebugUnitTest assembleDebug
```

For signed releases, supply `MONTY_KEYSTORE_PATH`, `MONTY_KEYSTORE_PASSWORD`,
`MONTY_KEY_ALIAS`, and `MONTY_KEY_PASSWORD` securely in the process environment.
Pass `-PmontyVersionCode=... -PmontyVersionName=...` matching android-version.json
to `assembleRelease`. Then run `node scripts/package-android-release.mjs`
from the repository root.

The private PDF regression fixtures are excluded from public source. Core
and updater tests can run with:

```sh
npx vitest run --exclude tests/parser.test.ts --exclude tests/monty-parser.test.ts
```
