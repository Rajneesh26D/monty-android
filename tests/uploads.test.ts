import { it, expect, vi } from 'vitest';
import { storeUpload } from '../server/uploads';
import { MAX_UPLOAD_BYTES } from '../shared/uploads';

it('streams a 55 MB file and PDF without buffering the request', async () => {
  class FixedLength {
    readable: ReadableStream;
    writable: WritableStream;
    constructor(expected: number) {
      let count = 0;
      const stream = new TransformStream({
        transform(chunk, controller) {
          count += chunk.byteLength;
          controller.enqueue(chunk);
        },
        flush() {
          if (count !== expected) throw Error('Length mismatch');
        },
      });
      this.readable = stream.readable;
      this.writable = stream.writable;
    }
  }
  vi.stubGlobal('FixedLengthStream', FixedLength);
  try {
    for (const pdf of [false, true]) {
      const size = 55_000_000;
      let sent = 0,
        stored = 0;
      const request = new Request('https://test/upload', {
        method: 'PUT',
        headers: { 'Content-Length': String(size) },
        duplex: 'half',
        body: new ReadableStream({
          pull(controller) {
            if (sent === size) return controller.close();
            const chunk = new Uint8Array(Math.min(65536, size - sent));
            if (!sent) chunk.set(new TextEncoder().encode('%PDF-1.7'));
            sent += chunk.byteLength;
            controller.enqueue(chunk);
          },
        }),
      } as RequestInit);
      const buffer = vi.spyOn(request, 'arrayBuffer');
      const bucket = {
        async put(_key: string, body: ReadableStream) {
          const reader = body.getReader();
          for (;;) {
            const next = await reader.read();
            if (next.done) break;
            stored += next.value.byteLength;
          }
        },
      } as unknown as R2Bucket;
      await storeUpload(request, bucket, 'file', 'application/pdf', pdf);
      expect(stored).toBe(size);
      expect(buffer).not.toHaveBeenCalled();
    }
  } finally {
    vi.unstubAllGlobals();
  }
});

it('rejects files over the upload limit before reading or storing them', async () => {
  const request = new Request('https://test/upload', {
    method: 'PUT',
    headers: { 'Content-Length': String(MAX_UPLOAD_BYTES + 1) },
    body: 'x',
  });
  const put = vi.fn();
  await expect(
    storeUpload(request, { put } as unknown as R2Bucket, 'file', 'application/pdf'),
  ).rejects.toMatchObject({ status: 413 });
  expect(put).not.toHaveBeenCalled();
});
it('prevents an older tab from overwriting a stored file with an empty upload', async () => {
  const put = vi.fn();
  await expect(
    storeUpload(
      new Request('https://test/upload', { method: 'PUT', body: new Uint8Array() }),
      { put } as unknown as R2Bucket,
      'file',
      'application/pdf',
    ),
  ).rejects.toMatchObject({ status: 400 });
  expect(put).not.toHaveBeenCalled();
});
