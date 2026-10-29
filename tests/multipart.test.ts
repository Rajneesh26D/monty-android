import { it, expect } from 'vitest';
import { multipart } from '../server/multipart';
import { uploadBinary, abortBinary } from '../src/storage/upload';
import { MAX_UPLOAD_BYTES, UPLOAD_PART_BYTES } from '../shared/uploads';

it('accepts exactly 500 MB, rejects larger files and binds upload sessions to their file', async () => {
  const files = new Map<string, string>();
  const bucket = {
    async createMultipartUpload() {
      return { uploadId: 'r2-id', abort: async () => {} };
    },
    async put(key: string, value: string) {
      files.set(key, value);
    },
    async get(key: string) {
      return files.has(key) ? { json: async () => JSON.parse(files.get(key)!) } : null;
    },
  } as unknown as R2Bucket;
  const start = (size: number) =>
    new Request('https://test/api/files/a?upload=start', {
      method: 'POST',
      body: JSON.stringify({ size, mime: 'application/pdf' }),
    });
  const response = await multipart(start(MAX_UPLOAD_BYTES), bucket, 'owner/files/a');
  expect(response?.status).toBe(200);
  const { id } = (await response!.json()) as { id: string };
  expect(JSON.parse(files.get('owner/uploads/' + id)!).size).toBe(MAX_UPLOAD_BYTES);
  await expect(
    multipart(start(MAX_UPLOAD_BYTES + 1), bucket, 'owner/files/a'),
  ).rejects.toMatchObject({ status: 413 });
  await expect(
    multipart(
      new Request('https://test/api/files/b?upload=part&session=' + id + '&part=1', {
        method: 'PUT',
        body: 'x',
      }),
      bucket,
      'owner/files/b',
    ),
  ).rejects.toMatchObject({ status: 400 });
});

it('resumes only missing parts and safely retries a lost completion receipt', async () => {
  const file = new Blob([new Uint8Array(UPLOAD_PART_BYTES * 2 + 7)]),
    checkpoint = new Map<string, any>();
  const checkpoints = {
    get: async (k: string) => structuredClone(checkpoint.get(k)),
    put: async (k: string, v: any) => {
      checkpoint.set(k, structuredClone(v));
    },
    delete: async (k: string) => {
      checkpoint.delete(k);
    },
  };
  let offline = true,
    lostReceipt = true,
    starts = 0;
  const parts: number[] = [],
    sizes: number[] = [];
  const send = async (path: string, options: RequestInit) => {
    const url = new URL(path, 'https://test');
    const action = url.searchParams.get('upload');
    if (action === 'start') {
      starts++;
      return Response.json({ id: 'session' });
    }
    if (action === 'part') {
      const n = Number(url.searchParams.get('part'));
      parts.push(n);
      if (n === 2 && offline) throw Error('Connection interrupted');
      sizes.push((options.body as Blob).size);
      return Response.json({ partNumber: n, etag: 'etag-' + n });
    }
    if (action === 'complete') {
      expect(JSON.parse(options.body as string).parts.map((p: any) => p.partNumber)).toEqual([
        1, 2, 3,
      ]);
      if (lostReceipt) {
        lostReceipt = false;
        throw Error('Receipt lost');
      }
      return Response.json({ ok: true });
    }
    throw Error('Unexpected upload request');
  };
  const upload = () => uploadBinary('files/file', file, 'application/pdf', send, checkpoints);
  await expect(upload()).rejects.toThrow('Connection interrupted');
  expect(checkpoint.get('files/file').parts).toHaveLength(1);
  offline = false;
  await expect(upload()).rejects.toThrow('Receipt lost');
  expect(checkpoint.get('files/file').parts).toHaveLength(3);
  await upload();
  expect(starts).toBe(1);
  expect(parts).toEqual([1, 2, 2, 3]);
  expect(sizes).toEqual([UPLOAD_PART_BYTES, UPLOAD_PART_BYTES, 7]);
  expect(checkpoint.size).toBe(0);
});

it('acknowledges completion after a lost receipt even when the session was already removed', async () => {
  const bucket = {
    get: async () => null,
    head: async () => ({ customMetadata: { uploadSession: 'finished' } }),
  } as unknown as R2Bucket;
  const response = await multipart(
    new Request('https://test/api/files/a?upload=complete&session=finished', {
      method: 'POST',
      body: '{}',
    }),
    bucket,
    'owner/files/a',
  );
  expect(await response?.json()).toEqual({ ok: true });
});

it('aborts an unfinished upload when its local file is deleted', async () => {
  let removed = false;
  const checkpoint = {
    get: async () => ({ id: 'session', size: 20_000_000, mime: 'application/pdf', parts: [] }),
    put: async () => {},
    delete: async () => {
      removed = true;
    },
  };
  const calls: string[] = [];
  await abortBinary(
    'files/file',
    async (path, options) => {
      calls.push(path + ':' + options.method);
      return Response.json({ ok: true });
    },
    checkpoint,
  );
  expect(calls).toEqual(['files/file?upload=abort&session=session:DELETE']);
  expect(removed).toBe(true);
});
