import { registerPlugin } from '@capacitor/core';
import { readLocalFileBlob } from '../storage/repository';
import { mobileConnection } from './cloud';
interface Source {
  id: string;
  name: string;
  mime: string;
  legacy?: boolean;
}
interface Viewer {
  openCached(source: Source): Promise<{ opened: boolean }>;
  download(source: Source & { token: string }): Promise<void>;
  begin(source: Source & { size: number }): Promise<{ session: string }>;
  append(options: { session: string; data: string }): Promise<void>;
  finish(options: { session: string; mime: string }): Promise<void>;
  cancel(options: { session: string }): Promise<void>;
}
const viewer = registerPlugin<Viewer>('FileViewer');
const pending = new Map<string, Promise<void>>();
export function openNativeFile(source: Source) {
  const key = `${source.legacy ? 'pdf' : 'file'}:${source.id}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const operation = open(source).finally(() => pending.delete(key));
  pending.set(key, operation);
  return operation;
}
async function open(source: Source) {
  if ((await viewer.openCached(source)).opened) return;
  const blob = await readLocalFileBlob(source.id, !!source.legacy);
  if (!blob) {
    const connection = await mobileConnection();
    if (!connection) throw new Error('Connect this phone to download the original file.');
    await viewer.download({ ...source, token: connection.token });
    return;
  }
  const { session } = await viewer.begin({ ...source, size: blob.size });
  try {
    // Never materialize the whole Blob or send a whole-file Base64 string.
    for (let offset = 0; offset < blob.size; offset += 512 * 1024) {
      const bytes = new Uint8Array(await blob.slice(offset, offset + 512 * 1024).arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 16384)
        binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
      await viewer.append({ session, data: btoa(binary) });
    }
    await viewer.finish({ session, mime: source.mime });
  } catch (error) {
    await viewer.cancel({ session }).catch(() => {});
    throw error;
  }
}
