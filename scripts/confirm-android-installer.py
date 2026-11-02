"""Verify replacement after the instrumented app confirms the real Android UI."""
import subprocess, re, time, pathlib, sys

def adb(*args):
    return subprocess.check_output(['adb', *args], text=True, timeout=25)

def timestamp(text):
    match = re.search(r'lastUpdateTime=(.+)', text)
    if not match:
        raise RuntimeError('Package update timestamp unavailable')
    return match.group(1).strip()

before = timestamp(pathlib.Path(sys.argv[1]).read_text())
for attempt in range(80):
    if timestamp(adb('shell', 'dumpsys', 'package', 'com.monty.study')) != before:
        print('Confirmed the real Android installer opened from Monty and completed replacement.')
        break
    time.sleep(1)
else:
    print(adb('shell', 'dumpsys', 'activity', 'top')[-5000:])
    raise RuntimeError('Monty did not complete installation through Android confirmation')
