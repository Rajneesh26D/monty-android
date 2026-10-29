import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { upgradeState } from '../shared/migrate';
import { emptyState, type State } from '../shared/types';
import { blankEntry } from '../src/core/vocabulary';
import { createWorker } from '../server/app';
import gateway from '../mobile-gateway/worker/index.mjs';
import { memoryBucket } from './helpers/memory-bucket';
import { MONTY_WEB_ORIGIN as web, MONTY_MOBILE_ORIGIN as mobile } from '../shared/cloud';
const mocks = vi.hoisted(() => ({
  secrets: new Map<string, string>(),
  legacy: undefined as State | undefined,
  query: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => ({
    get: async (options: any = {}) => ({
      value: mocks.secrets.get(options.key || 'token') || null,
    }),
    set: async (options: any) => {
      mocks.secrets.set(options.key || 'token', options.value);
    },
    remove: async (options: any = {}) => {
      mocks.secrets.delete(options.key || 'token');
    },
  }),
}));
vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    async checkConnectionsConsistency() {
      return { result: true };
    }
    async isConnection() {
      return { result: false };
    }
    async createConnection() {
      return { open: async () => {}, execute: async () => {}, query: mocks.query };
    }
  },
}));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA', Cache: 'CACHE' },
  Filesystem: { readFile: async () => ({ data: btoa('%PDF-1.7 original native PDF') }) },
}));
vi.mock('@capacitor/share', () => ({ Share: {} }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('migrates old SQLite data, merges rather than clearing the web library, and syncs both directions after offline changes', async () => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  vi.stubGlobal('indexedDB', new IDBFactory());
  const {
    IDBKeyRange,
    IDBRequest,
    IDBOpenDBRequest,
    IDBDatabase,
    IDBObjectStore,
    IDBTransaction,
    IDBCursor,
    IDBIndex,
  } = await import('fake-indexeddb');
  for (const [name, value] of Object.entries({
    IDBKeyRange,
    IDBRequest,
    IDBOpenDBRequest,
    IDBDatabase,
    IDBObjectStore,
    IDBTransaction,
    IDBCursor,
    IDBIndex,
  }))
    vi.stubGlobal(name, value);
  const events = new EventTarget();
  vi.stubGlobal('window', events);
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {} });
  vi.stubGlobal('navigator', { onLine: false });
  vi.stubGlobal('BroadcastChannel', undefined);
  mocks.secrets.clear();
  const local = upgradeState(emptyState()),
    remote = upgradeState(emptyState());
  const localWord = { ...blankEntry('Phone word'), id: 'phone-word' },
    remoteWord = { ...blankEntry('Web word'), id: 'web-word' };
  local.entries[localWord.id] = localWord;
  local.documents.push({
    id: 'phone-pdf',
    name: 'Phone PDF',
    hash: 'source-hash',
    createdAt: 1,
    entryIds: [localWord.id],
    status: 'ready',
    pendingPages: [],
  });
  remote.entries[remoteWord.id] = remoteWord;
  remote.monty!.folders['web-folder'] = {
    id: 'web-folder',
    parentId: null,
    area: 'grammar',
    name: 'Web grammar',
    pinned: false,
    profile: 'auto',
    createdAt: 10,
  };
  mocks.legacy = local;
  mocks.query.mockResolvedValue({ values: [{ payload: JSON.stringify(local) }] });
  const BUCKET = memoryBucket(),
    app = createWorker({}),
    backendEnv: any = { BUCKET, MONTY_GATEWAY_ORIGIN: mobile };
  await BUCKET.put('owner/library.json', JSON.stringify(remote));
  const relayEnv = {
    BUCKET: memoryBucket(),
    MONTY_UPSTREAM_ORIGIN: web,
    MONTY_UPSTREAM_TOKEN: 'private-test-service',
  };
  let offline = false;
  vi.stubGlobal('fetch', async (input: string, options: RequestInit = {}) => {
    if (offline) throw new Error('Offline');
    const request = new Request(input, {
      ...options,
      ...(options.body ? { duplex: 'half' } : {}),
    } as RequestInit);
    if (input.startsWith(mobile)) return gateway.fetch(request, relayEnv);
    if (input.startsWith(web)) return app.fetch(request, backendEnv);
    throw new Error('Unexpected network target');
  });
  const repository = await import('../src/storage/repository');
  const connection = await import('../src/services/cloud');
  const loaded = await repository.loadState();
  expect(loaded.entries['phone-word']).toBeDefined();
  expect(loaded.entries['web-word']).toBeUndefined();
  expect(
    (await (await BUCKET.get('owner/library.json'))!.json<any>()).entries['web-word'],
  ).toBeDefined();
  const pairing = (await (
    await app.fetch(new Request(web + '/api/devices/pairing', { method: 'POST' }), backendEnv)
  ).json()) as any;
  await connection.pairMobile(pairing.code);
  await repository.syncNow();
  const read = async () =>
    (await openDB('vocabmaster', 1)).get('state', 'current') as Promise<State>;
  let synced = await read();
  expect(Object.keys(synced.entries).sort()).toEqual(['phone-word', 'web-word']);
  expect(synced.monty!.folders['web-folder'].name).toBe('Web grammar');
  expect(
    (await (await BUCKET.get('owner/library.json'))!.json<any>()).entries['phone-word'],
  ).toBeDefined();
  expect(await (await BUCKET.get('owner/pdfs/phone-pdf.pdf'))!.text()).toContain(
    'original native PDF',
  );
  const db = await openDB('vocabmaster', 1);
  expect(
    (await db.get('private', 'before-native-cloud-migration')).entries['phone-word'],
  ).toBeDefined();
  const fromWeb = await (await BUCKET.get('owner/library.json'))!.json<State>();
  fromWeb.bookmarks = ['web-word'];
  await BUCKET.put('owner/library.json', JSON.stringify(fromWeb));
  await repository.syncNow();
  synced = await read();
  expect(synced.bookmarks).toContain('web-word');
  offline = true;
  const edited = structuredClone(synced);
  edited.bookmarks.push('phone-word');
  await repository.saveState(edited, synced);
  await repository.syncNow();
  expect((await read()).bookmarks).toContain('phone-word');
  expect((await (await BUCKET.get('owner/library.json'))!.json<State>()).bookmarks).not.toContain(
    'phone-word',
  );
  offline = false;
  await repository.syncNow();
  expect((await (await BUCKET.get('owner/library.json'))!.json<State>()).bookmarks.sort()).toEqual([
    'phone-word',
    'web-word',
  ]);
  const queryCount = mocks.query.mock.calls.length;
  await repository.loadState();
  expect(mocks.query).toHaveBeenCalledTimes(queryCount); // Migration does not replay a stale SQLite snapshot.
  await connection.disconnectMobile();
  expect((await read()).entries['web-word']).toBeDefined();
});
