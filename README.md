# Monty Android

Install from **https://monty-mobile.fuzzygenet512.chatgpt.site**. Download the
ARM64 APK on a modern 64-bit Android phone, or Universal if unsure. Open the
phone's download and approve installation. No USB connection, ADB, Android
Studio, or laptop script is needed. Both builds target Android 16 / API 36
and support Android 7 / API 24 onward.

## One library on the web and Android

1. In the existing Monty web app, open Settings → Connect Android.
2. Create a connection code. It is valid once for ten minutes.
3. In Android Settings → Sync with your web library, enter that code. On the
   same phone, the web page's Connect Monty link fills it automatically.

The phone then uses the **same library, files and AI backend** as the web app.
The existing private Sites/R2 backend remains authoritative; the mobile
service authenticates devices and forwards requests to it. No personal study
library is copied into the public download service or GitHub repository.
The private Site's service credential stays server-side. Android receives an
independent token stored with Android Keystore encryption; web Settings can
revoke it. Tokens last up to one year and can be replaced by pairing again.

Changes save locally, sync while online, and refresh on both open devices at
about fifteen-second intervals. Original files download on first use and
remain cached. Previously downloaded study material works offline; offline
changes sync on reconnection. Concurrent saves use revision checks and the
same three-way merge as the web app. The phone preserves its previous SQLite
manifest once, migrates into the shared sync storage path, and retains the
original SQLite snapshot for recovery. Existing native PDF files are read
lazily and queued for upload. Pairing an empty phone never replaces the web
library with an empty one; existing phone-only items are merged.

The original USB-installed project's package and signing key were absent from
saved source. This release line uses `com.monty.study` and one stable signing
key. An existing app with this package/key updates in place. If an older app
uses another package/key, export a backup from it before migrating. Never
uninstall an older app before retaining its phone-only material. Android
cannot copy another package's private database automatically.

## Updates and notifications

Settings → Updates checks the Monty download service, with GitHub Releases as
an alternative source. Before opening Android's installer, the updater
checks the permitted HTTPS origin, exact size, SHA-256, package, higher
versionCode, versionName and installed signing certificate. Android requires
you to permit installation from Monty and approve each APK update.

Settings → Notifications → App updates requests notification permission and
starts a connected-network WorkManager check about every six hours. Checks
also run when the app opens/returns to foreground. One notification is shown
per new version; tapping opens Settings. Android battery rules, force-stop,
network availability and notification settings affect delivery. Notifications
are optional and disabled until enabled.

## Releases

Increase **both** fields in `android-version.json` and update `notes`, then
push `main`. The workflow installs the Android SDK/licenses, runs checks,
builds and signs ARM64 and universal APKs, verifies signatures, ZIP and 64-bit
ELF 16 KiB alignment, and publishes complete GitHub and mobile-service releases.
An already published version is not overwritten. The mobile service only
switches its latest update manifest after all assets are uploaded.

### One-time Actions signing setup

Actions secret `MONTY_SIGNING_KEY` holds the owner's private short unlock
code. The repository contains only an authenticated AES-256-GCM encrypted
backup at `.github/signing/monty-release.enc.json`. The runner decrypts the
release key and mobile release-upload credential, masks them, and removes the
temporary key afterward. Keep the unlock code privately; never publish it or
an unencrypted signing key. The older `MONTY_SIGNING_BUNDLE` JSON is supported.
A fresh key would break updates to installed releases.

The connected GitHub app can push source and run Actions but does not have
Secrets permission. Missing signing setup stops the workflow explicitly;
it does not publish unsigned APKs. A local authorized release build can be
signed with the same key and published to the mobile service independently.

## Backend deployment

The existing private web Site serves `server/app.ts`, its original R2 library,
and owner-only pairing/revocation endpoints. The separate `mobile-gateway/`
Worker serves the APK landing page, downloads and narrow authenticated API
relay. Its R2 bucket stores release APKs/metadata only. Its runtime values are:

- `MONTY_UPSTREAM_ORIGIN`: the original private Monty web origin.
- `MONTY_UPSTREAM_TOKEN`: server-only Sites service access, stored as a secret.
- `MONTY_UPLOAD_TOKEN`: release upload authorization, stored as a secret.

The original Site also has `MONTY_GATEWAY_ORIGIN`. Preserve its private
access policy. A public mobile endpoint requires explicit owner authorization;
only APKs are anonymous downloads. All study API requests require a paired
device token. The relay does not forward owner device-management routes,
arbitrary URLs, browser cookies or server credentials to the phone.

## Local development

Use Node 22+, Java 21, Android SDK platform 36 and build-tools 36.0.0:

```sh
npm ci
npm run check
npm run android:sync
cd android
./gradlew testDebugUnitTest assembleDebug
```

For releases, supply `MONTY_KEYSTORE_PATH`, `MONTY_KEYSTORE_PASSWORD`,
`MONTY_KEY_ALIAS`, `MONTY_KEY_PASSWORD` in the process environment, then run
`assembleRelease`. Gradle reads `android-version.json`. From the root, run
`node scripts/package-android-release.mjs`. `update.json` advertises GitHub
assets; `mobile-update.json` advertises mobile-service assets. Use
`node scripts/publish-mobile-release.mjs` with `MONTY_UPLOAD_TOKEN` to upload
and atomically publish the latter. Never place these credentials in source.

Private PDF regression fixtures are omitted from public source. Run public
core and sync tests with:

```sh
npx vitest run --exclude tests/parser.test.ts --exclude tests/monty-parser.test.ts
```
