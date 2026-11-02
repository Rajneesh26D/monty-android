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
# Run the real worker without launching the app and verify a posted notification.
adb shell input keyevent KEYCODE_HOME
adb shell am instrument -w -e class 'com.monty.study.UpdateFlowTest#backgroundNotificationWithoutOpeningMonty' com.monty.study.test/androidx.test.runner.AndroidJUnitRunner | tee "$RUNNER_TEMP/background-notification.txt"
grep -q 'OK (1 test)' "$RUNNER_TEMP/background-notification.txt"
# Reinstall the current signed APK through the same foreground intent used by
# Monty, and confirm the real Android UI; never uninstall or clear app data.
adb push "release/Monty-${monty_version}-universal.apk" /data/local/tmp/monty-installer-test.apk
adb shell appops set com.monty.study REQUEST_INSTALL_PACKAGES allow
adb shell am instrument -w -e class 'com.monty.study.UpdateFlowTest#openInstallerFromForegroundActivity' com.monty.study.test/androidx.test.runner.AndroidJUnitRunner | tee "$RUNNER_TEMP/in-app-installer.txt"
grep -q 'OK (1 test)' "$RUNNER_TEMP/in-app-installer.txt"
python3 scripts/confirm-android-installer.py
adb shell am instrument -w -e class 'com.monty.study.UpgradeDataTest#verify' com.monty.study.test/androidx.test.runner.AndroidJUnitRunner | tee "$RUNNER_TEMP/installer-data-verify.txt"
grep -q 'OK (1 test)' "$RUNNER_TEMP/installer-data-verify.txt"
