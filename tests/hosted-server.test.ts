import { it, expect } from 'vitest';
import { createWorker } from '../server/app';
import { emptyState } from '../shared/types';
function bucket() {
  const files = new Map<string, { text: string; etag: string }>();
  let serial = 0;
  return {
    async get(key: string) {
      const item = files.get(key);
      return item
        ? {
            httpEtag: item.etag,
            json: async () => JSON.parse(item.text),
            body: new Blob([item.text]).stream(),
          }
        : null;
    },
    async put(key: string, value: string | ArrayBuffer, options: any) {
      const current = files.get(key);
      const condition = options?.onlyIf as Headers | undefined;
      if (
        condition?.get('If-Match') !== null &&
        condition?.get('If-Match') !== undefined &&
        condition.get('If-Match') !== current?.etag
      )
        return null;
      if (condition?.get('If-None-Match') === '*' && current) return null;
      const item = {
        text: typeof value === 'string' ? value : new TextDecoder().decode(value),
        etag: '"revision-' + ++serial + '"',
      };
      files.set(key, item);
      return { httpEtag: item.etag };
    },
    async delete(key: string) {
      files.delete(key);
    },
  } as any;
}
it('keeps the cloud copy on stale updates and restores a valid library', async () => {
  const app = createWorker({}),
    env = { BUCKET: bucket(), OPENROUTER_API_KEY: '' };
  const get = () => app.fetch(new Request('https://vocab.test/api/state'), env);
  const put = (state: unknown, headers: Record<string, string>) =>
    app.fetch(
      new Request('https://vocab.test/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(state),
      }),
      env,
    );
  expect(await (await get()).json()).toEqual({ state: null });
  const state = emptyState();
  state.settings.hideReviewAnswers = true;
  const first = await put(state, { 'If-None-Match': '*' });
  expect(first.status).toBe(200);
  expect((await put(emptyState(), { 'If-None-Match': '*' })).status).toBe(412);
  expect((await put(emptyState(), { 'If-Match': '"old"' })).status).toBe(412);
  expect(((await (await get()).json()) as any).state.settings.hideReviewAnswers).toBe(true);
  expect((await put(emptyState(), { 'If-Match': 'W/' + first.headers.get('etag')! })).status).toBe(
    200,
  );
  expect((await put({ broken: true }, { 'If-Match': '"revision-2"' })).status).toBe(400);
  expect((await put(emptyState(), {})).status).toBe(428);
});
it('validates PDFs and rejects cross-origin account requests', async () => {
  const app = createWorker({}),
    env = { BUCKET: bucket(), OPENROUTER_API_KEY: '' };
  expect(
    (
      await app.fetch(
        new Request('https://vocab.test/api/state', {
          headers: { Origin: 'https://another.test' },
        }),
        env,
      )
    ).status,
  ).toBe(403);
  const path = 'https://vocab.test/api/pdfs/doc-1';
  expect(
    (await app.fetch(new Request(path, { method: 'PUT', body: 'not a PDF' }), env)).status,
  ).toBe(400);
  expect(
    (await app.fetch(new Request(path, { method: 'PUT', body: '%PDF-1.7 test' }), env)).status,
  ).toBe(200);
  const pdf = await app.fetch(new Request(path), env);
  expect(pdf.headers.get('content-type')).toBe('application/pdf');
  expect(await pdf.text()).toContain('%PDF-1.7');
  expect((await app.fetch(new Request(path, { method: 'DELETE' }), env)).status).toBe(200);
  expect((await app.fetch(new Request(path), env)).status).toBe(404);
  expect(
    (
      await app.fetch(
        new Request('https://vocab.test/api/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{"mode":"enrich","entries":[],"pages":[]}',
        }),
        env,
      )
    ).status,
  ).toBe(400);
});
