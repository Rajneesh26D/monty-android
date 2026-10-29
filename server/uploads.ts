import { DIRECT_UPLOAD_BYTES } from '../shared/uploads';
import { APIError } from './models';

export async function storeUpload(
  request: Request,
  bucket: R2Bucket,
  key: string,
  mime: string,
  pdf = false,
) {
  const size = Number(request.headers.get('Content-Length') || 0);
  if (size > DIRECT_UPLOAD_BYTES)
    throw new APIError(413, 'Refresh Monty to upload this file in smaller parts.');
  const validPdf = (bytes: Uint8Array) =>
    new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-');
  const options = { httpMetadata: { contentType: mime } };
  if (size <= 8 * 1024 * 1024 || !request.body) {
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength)
      throw new APIError(400, 'This file is empty. Refresh Monty and retry the upload.');
    if (bytes.byteLength > DIRECT_UPLOAD_BYTES)
      throw new APIError(413, 'Refresh Monty to upload this file in smaller parts.');
    if (pdf && !validPdf(new Uint8Array(bytes))) throw new APIError(400, 'Invalid PDF');
    await bucket.put(key, bytes, options);
    return;
  }
  // R2 requires a stream with a known length. Keep large files out of the
  // Worker's 128 MB heap, including PDFs that need their header checked first.
  const reader = request.body.getReader();
  const prefix: Uint8Array[] = [];
  let prefixLength = 0;
  while (prefixLength < 1024) {
    const next = await reader.read();
    if (next.done) break;
    prefix.push(next.value);
    prefixLength += next.value.byteLength;
  }
  if (pdf) {
    const header = new Uint8Array(Math.min(prefixLength, 1024));
    let offset = 0;
    for (const chunk of prefix) {
      const part = chunk.subarray(0, header.length - offset);
      header.set(part, offset);
      offset += part.length;
      if (offset === header.length) break;
    }
    if (!validPdf(header)) {
      await reader.cancel();
      throw new APIError(400, 'Invalid PDF');
    }
  }
  const stream = new FixedLengthStream(size);
  const writer = stream.writable.getWriter();
  const pump = (async () => {
    try {
      for (const chunk of prefix) await writer.write(chunk);
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        await writer.write(next.value);
      }
      await writer.close();
    } catch (error) {
      await writer.abort(error).catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
  })();
  await Promise.all([bucket.put(key, stream.readable, options), pump]);
}
