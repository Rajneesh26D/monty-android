#!/usr/bin/env bash
set -euo pipefail
# Use the actual previous release, never uninstall the app, and prove that
# files, SQLite and preferences survive the Android 16 package replacement.
curl -fsSL --retry 3 https://github.com/Rajneesh26D/monty-android/releases/download/v2.1.2/Monty-2.1.2-universal.apk -o "$RUNNER_TEMP/monty-previous.apk"
adb install "$RUNNER_TEMP/monty-previous.apk"
adb install -t android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk
adb shell am instrument -w -e class 'com.monty.study.UpgradeDataTest#seed' com.monty.study.test/androidx.test.runner.AndroidJUnitRunner | tee "$RUNNER_TEMP/upgrade-seed.txt"
grep -q 'OK (1 test)' "$RUNNER_TEMP/upgrade-seed.txt"
monty_version=$(node -p 'require("./android-version.json").versionName')
adb install -r "release/Monty-${monty_version}-universal.apk"
adb shell am instrument -w -e class 'com.monty.study.UpgradeDataTest#verify' com.monty.study.test/androidx.test.runner.AndroidJUnitRunner | tee "$RUNNER_TEMP/upgrade-verify.txt"
grep -q 'OK (1 test)' "$RUNNER_TEMP/upgrade-verify.txt"
echo 'Verified Android 16 update from the actual 2.1.2 APK, without uninstalling and with private app data retained.'
