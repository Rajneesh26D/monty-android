import { MAX_UPLOAD_BYTES, UPLOAD_PART_BYTES, UPLOAD_SIZE_ERROR } from '../../shared/uploads';

interface Checkpoint {
  id: string;
  size: number;
  mime: string;
  parts: { partNumber: number; etag: string }[];
}
type Send = (path: string, options: RequestInit, timeout?: number) => Promise<Response>;
interface Checkpoints {
  get: (path: string) => Promise<Checkpoint | undefined>;
  put: (path: string, value: Checkpoint) => Promise<unknown>;
  delete: (path: string) => Promise<unknown>;
}
export async function abortBinary(path: string, send: Send, checkpoints: Checkpoints) {
  const saved = await checkpoints.get(path);
  if (!saved) return;
  const response = await send(path + '?upload=abort&session=' + encodeURIComponent(saved.id), {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404)
    throw new Error('File deletion will retry when online.');
  await checkpoints.delete(path);
}
export async function uploadBinary(
  path: string,
  data: Blob | Uint8Array,
  mime: string,
  send: Send,
  checkpoints: Checkpoints,
) {
  const size = data instanceof Blob ? data.size : data.byteLength;
  if (size > MAX_UPLOAD_BYTES) throw new Error(UPLOAD_SIZE_ERROR);
  const checked = async (url: string, options: RequestInit) => {
    const response = await send(url, options, 600000);
    if (!response.ok) throw new Error('File backup paused. It will resume when online.');
    return response.json();
  };
  if (size <= UPLOAD_PART_BYTES) {
    await checked(path, {
      method: 'PUT',
      headers: { 'Content-Type': mime },
      body: data as BodyInit,
    });
    return;
  }
  let saved = await checkpoints.get(path);
  if (!saved || saved.size !== size || saved.mime !== mime) {
    const started = await checked(path + '?upload=start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ size, mime }),
    });
    saved = { id: started.id, size, mime, parts: [] };
    await checkpoints.put(path, saved);
  }
  for (
    let start = saved.parts.length * UPLOAD_PART_BYTES;
    start < size;
    start += UPLOAD_PART_BYTES
  ) {
    const number = saved.parts.length + 1;
    const part =
      data instanceof Blob
        ? data.slice(start, start + UPLOAD_PART_BYTES)
        : data.subarray(start, start + UPLOAD_PART_BYTES);
    const response = await send(
      path + '?upload=part&session=' + encodeURIComponent(saved.id) + '&part=' + number,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: part as BodyInit,
      },
      600000,
    );
    if (response.status === 404) await checkpoints.delete(path);
    if (!response.ok) throw new Error('File backup paused. It will resume when online.');
    const uploaded = await response.json();
    if (uploaded.partNumber !== number || typeof uploaded.etag !== 'string')
      throw new Error('File part was not acknowledged. Retry when online.');
    saved.parts.push(uploaded);
    await checkpoints.put(path, saved);
  }
  const response = await send(
    path + '?upload=complete&session=' + encodeURIComponent(saved.id),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts: saved.parts }),
    },
    600000,
  );
  if (response.status === 404) await checkpoints.delete(path);
  if (!response.ok) throw new Error('File backup paused. It will resume when online.');
  await checkpoints.delete(path);
}
