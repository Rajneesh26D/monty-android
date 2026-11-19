"""Open a release APK in Android Downloads and confirm the real system update."""
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET


def adb(*args):
    return subprocess.check_output(['adb', *args], stderr=subprocess.STDOUT, text=True, timeout=25)


def package_code():
    match = re.search(r'\bversionCode=(\d+)', adb('shell', 'dumpsys', 'package', 'com.monty.study'))
    return int(match.group(1)) if match else None


def nodes():
    try:
        adb('shell', 'uiautomator', 'dump', '/sdcard/monty-install-test.xml')
        return list(ET.fromstring(adb('shell', 'cat', '/sdcard/monty-install-test.xml')).iter('node'))
    except (ET.ParseError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return []


def tap_when_visible(predicate, description):
    deadline = time.monotonic() + 35
    while time.monotonic() < deadline:
        for node in nodes():
            if predicate(node):
                left, top, right, bottom = map(int, re.findall(r'\d+', node.get('bounds', '')))
                adb('shell', 'input', 'tap', str((left + right) // 2), str((top + bottom) // 2))
                return
        time.sleep(0.5)
    raise RuntimeError(f'Android did not show {description}: ' + adb('shell', 'dumpsys', 'activity', 'top')[-5000:])


filename, expected = sys.argv[1], int(sys.argv[2])
assert package_code() < expected, 'An earlier Monty version must already be installed'
action = 'android.intent.action.VIEW_DOWNLOADS'
resolved = adb('shell', 'cmd', 'package', 'resolve-activity', '--brief', '-a', action).strip().splitlines()[-1]
if '/' not in resolved or 'ResolverActivity' in resolved:
    raise RuntimeError(f'Android Downloads activity could not be selected: {resolved}')
downloads_package = resolved.split('/')[0]
adb('shell', 'appops', 'set', downloads_package, 'REQUEST_INSTALL_PACKAGES', 'allow')
adb('shell', 'am', 'start', '-W', '-a', action, '-n', resolved)
tap_when_visible(lambda node: filename in (node.get('text'), node.get('content-desc')), filename)
tap_when_visible(
    lambda node: node.get('text', '').lower() == 'update'
    and ('packageinstaller' in node.get('package', '') or 'permissioncontroller' in node.get('package', '')),
    'the system Update button',
)
deadline = time.monotonic() + 45
while time.monotonic() < deadline:
    if package_code() == expected:
        print(f'Android Downloads updated Monty in place to version code {expected}.')
        break
    time.sleep(1)
else:
    raise RuntimeError('Android did not replace Monty after confirming the downloaded APK')
