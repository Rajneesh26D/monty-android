import { MAX_UPLOAD_BYTES, UPLOAD_PART_BYTES, UPLOAD_SIZE_ERROR } from '../shared/uploads';
import { APIError } from './models';

interface Session {
  key: string;
  uploadId: string;
  size: number;
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
async function input(request: Request) {
  const text = await request.text();
  if (text.length > 20000) throw new APIError(413, 'Upload metadata too large.');
  return JSON.parse(text);
}
export async function multipart(
  request: Request,
  bucket: R2Bucket,
  key: string,
  pdf = false,
): Promise<Response | null> {
  const query = new URL(request.url).searchParams,
    action = query.get('upload');
  if (!action) return null;
  if (action === 'start' && request.method === 'POST') {
    const data = await input(request);
    if (!Number.isSafeInteger(data.size) || data.size <= 0)
      throw new APIError(400, 'Invalid file size.');
    if (data.size > MAX_UPLOAD_BYTES) throw new APIError(413, UPLOAD_SIZE_ERROR);
    const id = crypto.randomUUID();
    const upload = await bucket.createMultipartUpload(key, {
      httpMetadata: {
        contentType: pdf
          ? 'application/pdf'
          : typeof data.mime === 'string'
            ? data.mime.slice(0, 200)
            : 'application/octet-stream',
      },
      customMetadata: { uploadSession: id },
    });
    try {
      await bucket.put(
        'owner/uploads/' + id,
        JSON.stringify({ key, uploadId: upload.uploadId, size: data.size }),
      );
    } catch (error) {
      await upload.abort();
      throw error;
    }
    return json({ id });
  }
  const id = query.get('session') ?? '';
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new APIError(400, 'Invalid upload session.');
  const sessionKey = 'owner/uploads/' + id,
    record = await bucket.get(sessionKey);
  if (!record) {
    // Completion may have succeeded even if its receipt was lost on mobile.
    if (action === 'complete' && request.method === 'POST') {
      const saved = await bucket.head(key);
      if (saved?.customMetadata?.uploadSession === id) return json({ ok: true });
    }
    throw new APIError(404, 'Upload session expired. Retry the upload.');
  }
  const session = await record.json<Session>();
  if (session.key !== key) throw new APIError(400, 'Upload session belongs to a different file.');
  const upload = bucket.resumeMultipartUpload(key, session.uploadId);
  if (action === 'part' && request.method === 'PUT') {
    const number = Number(query.get('part'));
    const total = Math.ceil(session.size / UPLOAD_PART_BYTES);
    if (!Number.isSafeInteger(number) || number < 1 || number > total)
      throw new APIError(400, 'Invalid upload part.');
    const expected = Math.min(UPLOAD_PART_BYTES, session.size - (number - 1) * UPLOAD_PART_BYTES);
    const length = Number(request.headers.get('Content-Length') || 0);
    if (length && length !== expected) throw new APIError(400, 'Upload part has the wrong size.');
    if (!request.body) throw new APIError(400, 'Upload part is empty.');
    const reader = request.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > expected) {
        await reader.cancel();
        throw new APIError(413, 'Upload part too large.');
      }
      chunks.push(next.value);
    }
    if (size !== expected) throw new APIError(400, 'Upload part is incomplete.');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (pdf && number === 1 && !new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-'))
      throw new APIError(400, 'Invalid PDF');
    return json(await upload.uploadPart(number, bytes));
  }
  if (action === 'complete' && request.method === 'POST') {
    const data = await input(request);
    if (
      !Array.isArray(data.parts) ||
      data.parts.length !== Math.ceil(session.size / UPLOAD_PART_BYTES) ||
      data.parts.some(
        (p: R2UploadedPart, i: number) =>
          p.partNumber !== i + 1 || typeof p.etag !== 'string' || !p.etag,
      )
    )
      throw new APIError(400, 'Upload is incomplete.');
    await upload.complete(data.parts);
    await bucket.delete(sessionKey);
    return json({ ok: true });
  }
  if (action === 'abort' && request.method === 'DELETE') {
    await upload.abort();
    await bucket.delete(sessionKey);
    return json({ ok: true });
  }
  throw new APIError(405, 'Invalid upload operation.');
}
