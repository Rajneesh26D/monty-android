"""Check 64-bit native libraries for Android 16's 16 KiB page support."""
import struct
import sys
import zipfile

for apk in sys.argv[1:]:
    count = 0
    with zipfile.ZipFile(apk) as archive:
        for name in archive.namelist():
            if not name.startswith(("lib/arm64-v8a/", "lib/x86_64/")) or not name.endswith(".so"):
                continue
            data = archive.read(name)
            if data[:5] != b"\x7fELF\x02":
                raise SystemExit(f"Invalid 64-bit ELF: {name}")
            endian = "<" if data[5] == 1 else ">"
            offset = struct.unpack_from(endian + "Q", data, 32)[0]
            entry_size, entries = struct.unpack_from(endian + "HH", data, 54)
            loads = 0
            for index in range(entries):
                entry = offset + index * entry_size
                kind = struct.unpack_from(endian + "I", data, entry)[0]
                if kind != 1:
                    continue
                file_offset, virtual_address = struct.unpack_from(endian + "QQ", data, entry + 8)
                alignment = struct.unpack_from(endian + "Q", data, entry + 48)[0]
                if alignment < 16384 or file_offset % 16384 != virtual_address % 16384:
                    raise SystemExit(f"16 KiB ELF alignment failed: {name}")
                loads += 1
            if not loads:
                raise SystemExit(f"ELF has no loadable segments: {name}")
            count += 1
    if not count:
        raise SystemExit(f"No 64-bit native libraries found in {apk}")
    print(f"{apk}: {count} native 64-bit libraries support 16 KiB pages")
