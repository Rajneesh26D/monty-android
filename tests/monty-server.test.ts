import { it, expect } from 'vitest';
import { createWorker } from '../server/app';
import { emptyState } from '../shared/types';
import { upgradeState } from '../shared/migrate';
function bucket() {
  let n = 0;
  const files = new Map<string, { body: string; mime: string; etag: string }>();
  return {
    files,
    async get(key: string) {
      const x = files.get(key);
      return x
        ? {
            httpEtag: x.etag,
            httpMetadata: { contentType: x.mime },
            json: async () => JSON.parse(x.body),
            body: new Blob([x.body]).stream(),
          }
        : null;
    },
    async put(key: string, body: any, options: any) {
      const old = files.get(key),
        match = options?.onlyIf?.get('If-Match');
      if (match && match !== old?.etag) return null;
      if (options?.onlyIf?.get('If-None-Match') === '*' && old) return null;
      const x = {
        body: typeof body === 'string' ? body : new TextDecoder().decode(body),
        mime: options?.httpMetadata?.contentType ?? 'application/json',
        etag: '"' + ++n + '"',
      };
      files.set(key, x);
      return { httpEtag: x.etag };
    },
    async delete(key: string) {
      files.delete(key);
    },
  } as any;
}
it('backs up v1 before upgrading and rejects old clients after v2 is saved', async () => {
  const b = bucket(),
    env = { BUCKET: b, OPENROUTER_API_KEY: '' },
    app = createWorker({});
  const put = (s: unknown, rev: string | null) =>
    app.fetch(
      new Request('https://test/api/state', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(rev ? { 'If-Match': rev } : { 'If-None-Match': '*' }),
        },
        body: JSON.stringify(s),
      }),
      env,
    );
  const initial = await put(emptyState(), null);
  const upgraded = await put(upgradeState(emptyState()), initial.headers.get('etag'));
  expect(upgraded.status).toBe(200);
  expect(b.files.has('owner/backups/v1-before-monty.json')).toBe(true);
  expect((await put(emptyState(), upgraded.headers.get('etag'))).status).toBe(409);
  const latest = await app.fetch(new Request('https://test/api/state'), env);
  expect(((await latest.json()) as any).state.version).toBe(2);
});
it('stores notes/banks privately and serves arbitrary files as downloads', async () => {
  const b = bucket(),
    env = { BUCKET: b, OPENROUTER_API_KEY: '' },
    app = createWorker({});
  const uri = 'https://test/api/files/note-1';
  const p = await app.fetch(
    new Request(uri, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'Study notes',
    }),
    env,
  );
  expect(p.status).toBe(200);
  const get = await app.fetch(new Request(uri), env);
  expect(get.headers.get('Content-Disposition')).toBe('attachment');
  expect(get.headers.get('Content-Type')).toBe('text/plain');
  expect(await get.text()).toBe('Study notes');
  expect((await app.fetch(new Request(uri, { method: 'DELETE' }), env)).status).toBe(200);
  expect((await app.fetch(new Request(uri), env)).status).toBe(404);
});
it('flattens folders sent by an older tab while retaining IDs and PDF pin metadata', async () => {
  const b = bucket(),
    env = { BUCKET: b, OPENROUTER_API_KEY: '' },
    app = createWorker({});
  const state = upgradeState(emptyState());
  const root = state.monty!.folders['english-vocab-anto-syno'];
  state.monty!.folders.child = { ...root, id: 'child', parentId: root.id, name: 'Keep me' };
  state.documents.push({
    id: 'pdf',
    folderId: 'child',
    name: 'Pinned PDF',
    pinned: true,
    hash: 'hash',
    entryIds: [],
    pendingPages: [],
    createdAt: 1,
    status: 'ready',
  });
  const response = await app.fetch(
    new Request('https://test/api/state', {
      method: 'PUT',
      headers: { 'If-None-Match': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    }),
    env,
  );
  expect(response.status).toBe(200);
  const saved = JSON.parse(b.files.get('owner/library.json').body);
  expect(saved.monty.folders.child).toEqual({ ...state.monty!.folders.child, parentId: null });
  expect(saved.documents).toEqual(state.documents);
});
