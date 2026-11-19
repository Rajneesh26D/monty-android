#!/usr/bin/env bash
set -euo pipefail
# Start with the release reported in the installer issue. Keep the same app
# installed while both user-facing upgrade routes replace it.
previous=2.1.23
previous_release="https://github.com/Rajneesh26D/monty-android/releases/download/v${previous}"
curl -fsSL --retry 3 "$previous_release/Monty-${previous}-universal.apk" -o "$RUNNER_TEMP/monty-previous.apk"
adb install "$RUNNER_TEMP/monty-previous.apk"
adb install -t android/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk
adb shell am instrument -w -e class 'com.monty.study.UpgradeDataTest#seed' com.monty.study.test/androidx.test.runner.AndroidJUnitRunner | tee "$RUNNER_TEMP/upgrade-seed.txt"
grep -q 'OK (1 test)' "$RUNNER_TEMP/upgrade-seed.txt"
monty_version=$(node -p 'require("./android-version.json").versionName')
download="Monty-${monty_version}-universal.apk"
adb shell mkdir -p /sdcard/Download
adb push "release/$download" "/sdcard/Download/$download"
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Download/$download"
adb shell pm disable-user --user 0 com.monty.study.test/android.app.Activity
python3 scripts/install-downloaded-apk.py "$download" "$(node -p 'require("./android-version.json").versionCode')"
adb shell pm enable --user 0 com.monty.study.test/android.app.Activity
adb shell am instrument -w -e class 'com.monty.study.UpgradeDataTest#verify' com.monty.study.test/androidx.test.runner.AndroidJUnitRunner | tee "$RUNNER_TEMP/upgrade-verify.txt"
grep -q 'OK (1 test)' "$RUNNER_TEMP/upgrade-verify.txt"
echo "Verified Android 16 update from the actual ${previous} APK through Downloads, without uninstalling and with private app data retained."
# Model a normally used app that has been closed, not an app never launched
# after installation (Android intentionally suppresses stopped-app work).
adb shell am start -W -n com.monty.study/.MainActivity
adb shell input keyevent KEYCODE_HOME
adb shell am instrument -w -e class 'com.monty.study.UpdateFlowTest#backgroundNotificationWithoutOpeningMonty' com.monty.study.test/androidx.test.runner.AndroidJUnitRunner | tee "$RUNNER_TEMP/background-notification.txt"
monty_background_result=0
grep -q 'OK (1 test)' "$RUNNER_TEMP/background-notification.txt" || monty_background_result=1
# Exercise the actual JavaScript bridge, native update activity, verification
# and higher-version Android confirmation; never uninstall or clear app data.
adb push "$RUNNER_TEMP/monty-next.apk" /data/local/tmp/monty-installer-test.apk
adb shell appops set com.monty.study REQUEST_INSTALL_PACKAGES deny
adb shell dumpsys package com.monty.study > "$RUNNER_TEMP/installer-before.txt"
adb shell am instrument -w -e nextCode "$MONTY_TEST_NEXT_CODE" -e nextName "$MONTY_TEST_NEXT_NAME" -e class 'com.monty.study.UpdateFlowTest#openInstallerFromForegroundActivity' com.monty.study.test/androidx.test.runner.AndroidJUnitRunner > "$RUNNER_TEMP/in-app-installer.txt" 2>&1 &
monty_installer_pid=$!
monty_installer_result=0
if ! python3 scripts/confirm-android-installer.py "$RUNNER_TEMP/installer-before.txt"; then
  monty_installer_result=1
  adb shell am force-stop com.monty.study
  adb logcat -d -t 1500 | grep -E 'ActivityTaskManager|PackageInstaller|FileProvider|AndroidRuntime' || true
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
