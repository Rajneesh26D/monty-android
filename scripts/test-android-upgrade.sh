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
# Model a normally used app that has been closed, not an app never launched
# after installation (Android intentionally suppresses stopped-app work).
adb shell am start -W -n com.monty.study/.MainActivity
adb shell input keyevent KEYCODE_HOME
adb shell am instrument -w -e class 'com.monty.study.UpdateFlowTest#backgroundNotificationWithoutOpeningMonty' com.monty.study.test/androidx.test.runner.AndroidJUnitRunner | tee "$RUNNER_TEMP/background-notification.txt"
monty_background_result=0
grep -q 'OK (1 test)' "$RUNNER_TEMP/background-notification.txt" || monty_background_result=1
# Reinstall the current signed APK through the same foreground intent used by
# Monty, and confirm the real Android UI; never uninstall or clear app data.
adb push "release/Monty-${monty_version}-universal.apk" /data/local/tmp/monty-installer-test.apk
adb shell appops set com.monty.study REQUEST_INSTALL_PACKAGES allow
adb shell dumpsys package com.monty.study > "$RUNNER_TEMP/installer-before.txt"
adb shell am instrument -w -e class 'com.monty.study.UpdateFlowTest#openInstallerFromForegroundActivity' com.monty.study.test/androidx.test.runner.AndroidJUnitRunner > "$RUNNER_TEMP/in-app-installer.txt" 2>&1 &
monty_installer_pid=$!
monty_installer_result=0
if ! python3 scripts/confirm-android-installer.py "$RUNNER_TEMP/installer-before.txt"; then
  monty_installer_result=1
  adb shell am force-stop com.monty.study
  adb logcat -d -t 1500 | rg 'ActivityTaskManager|PackageInstaller|FileProvider|AndroidRuntime' || true
fi
# Replacement intentionally kills the instrumentation process. The ready marker,
# system Install button, changed package timestamp and retained data together
# prove this flow; an ordinary JUnit completion would dismiss the installer.
wait "$monty_installer_pid" || true
cat "$RUNNER_TEMP/in-app-installer.txt"
grep -q 'MONTY_INSTALLER_READY' "$RUNNER_TEMP/in-app-installer.txt" || monty_installer_result=1
adb shell am instrument -w -e class 'com.monty.study.UpgradeDataTest#verify' com.monty.study.test/androidx.test.runner.AndroidJUnitRunner | tee "$RUNNER_TEMP/installer-data-verify.txt"
grep -q 'OK (1 test)' "$RUNNER_TEMP/installer-data-verify.txt"

[ "$monty_background_result" -eq 0 ]
[ "$monty_installer_result" -eq 0 ]
