"""Exercise the real foreground Android package installer, then verify replacement."""
import subprocess, re, time, xml.etree.ElementTree as ET

def adb(*args):
    return subprocess.check_output(['adb', *args], text=True, timeout=25)

def updated():
    match = re.search(r'lastUpdateTime=(.+)', adb('shell', 'dumpsys', 'package', 'com.monty.study'))
    if not match:
        raise RuntimeError('Package update timestamp unavailable')
    return match.group(1).strip()

before = updated()
xml = ''
for attempt in range(20):
    try:
        adb('shell', 'uiautomator', 'dump', '/sdcard/monty-installer.xml')
        xml = adb('shell', 'cat', '/sdcard/monty-installer.xml')
        nodes = ET.fromstring(xml).iter('node')
        button = next((node for node in nodes
                       if node.get('text', '').lower() in ('update', 'install')
                       and 'packageinstaller' in node.get('package', '')
                       and node.get('enabled') == 'true'), None)
        if button is not None:
            bounds = list(map(int, re.findall(r'\d+', button.get('bounds', ''))))
            assert len(bounds) == 4
            adb('shell', 'input', 'tap', str((bounds[0]+bounds[2])//2), str((bounds[1]+bounds[3])//2))
            break
    except (subprocess.SubprocessError, ET.ParseError):
        pass
    time.sleep(1)
else:
    print('Last Android UI:', xml)
    raise RuntimeError('The in-app action did not display an Android Install/Update confirmation')

for attempt in range(40):
    if updated() != before:
        print('Confirmed the real Android installer opened from Monty and completed replacement.')
        break
    time.sleep(1)
else:
    print(adb('shell', 'dumpsys', 'activity', 'top')[-5000:])
    raise RuntimeError('Android confirmation was tapped but the APK was not installed')
