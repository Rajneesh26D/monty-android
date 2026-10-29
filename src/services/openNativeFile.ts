import { registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { uid } from '../../shared/types';
const viewer = registerPlugin<{ open(options: { uri: string; mime: string }): Promise<void> }>(
  'FileViewer',
);
export async function openNativeFile(bytes: Uint8Array, name: string, mime: string) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 16384)
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  const safeName = name.replace(/[^\p{L}\p{N} ._-]/gu, '_').slice(-120) || 'file';
  const file = await Filesystem.writeFile({
    path: `open-files/${uid()}/${safeName}`,
    data: btoa(binary),
    directory: Directory.Cache,
    recursive: true,
  });
  await viewer.open({ uri: file.uri, mime });
}
