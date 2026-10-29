import { uploadBinary, abortBinary } from './upload';
import { Capacitor } from '@capacitor/core';
import { SecureStore } from '../services/secure';
import { openDB } from 'idb';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { type State, emptyState } from '../../shared/types';
import { stateSchema } from '../../shared/state-schema';
import { upgradeState } from '../../shared/migrate';
import type { AttemptClock } from '../../shared/monty';
import { mergeCloudState } from './merge';
import { cloudEnabled, mobileCloud, mobileConnection, siteFetch } from '../services/cloud';
const native = Capacitor.isNativePlatform();
const hosted = cloudEnabled;
const offline = import.meta.env.VITE_OFFLINE === 'true';
const offlineId =
  offline && typeof document !== 'undefined'
    ? document.getElementById('monty-offline-data')?.getAttribute('data-library')
    : null;
const localName = offlineId ? 'monty-offline-' + offlineId : 'vocabmaster';
const browser = () =>
  openDB(localName, 1, {
    upgrade(db) {
      for (const name of ['state', 'pdfs', 'private'])
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    },
  });
const assets = () =>
  openDB(offlineId ? localName + '-assets' : 'monty-assets', 1, {
    upgrade(db) {
      for (const name of ['files', 'jobs', 'timers']) db.createObjectStore(name);
    },
  });
let connection: Promise<import('@capacitor-community/sqlite').SQLiteDBConnection> | undefined;
async function sqlite() {
  connection ??= (async () => {
    const { SQLiteConnection, CapacitorSQLite } = await import('@capacitor-community/sqlite');
    const manager = new SQLiteConnection(CapacitorSQLite);
    await manager.checkConnectionsConsistency();
    const exists = await manager.isConnection('vocabmaster', false);
    const db = exists.result
      ? await manager.retrieveConnection('vocabmaster', false)
      : await manager.createConnection('vocabmaster', false, 'no-encryption', 1, false);
    await db.open();
    await db.execute(
      'CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);',
    );
    return db;
  })();
  return connection;
}
let writes: Promise<unknown> = Promise.resolve();
let pendingLocalWrites = 0;
export async function readStoredState(): Promise<State | undefined> {
  return (await browser()).get('state', 'current');
}
export async function loadState(): Promise<State> {
  let value: unknown;
  if (native) {
    const db = await browser();
    if (!(await db.get('private', 'native-cloud-migrated'))) {
      const r = await (await sqlite()).query('SELECT payload FROM app_state WHERE id=1');
      const legacy = r.values?.[0]
        ? upgradeState(stateSchema.parse(JSON.parse(r.values[0].payload)) as State)
        : undefined;
      const existing: State | undefined = await db.get('state', 'current');
      const migrated =
        legacy && existing
          ? mergeCloudState(undefined, legacy, upgradeState(existing))
          : legacy || (existing && upgradeState(existing)) || upgradeState(emptyState());
      const tx = db.transaction(['state', 'private'], 'readwrite');
      await tx.objectStore('state').put(migrated, 'current');
      if (legacy) await tx.objectStore('private').put(legacy, 'before-native-cloud-migration');
      const old: CloudMeta = (await tx.objectStore('private').get('cloud')) || initialMeta();
      await tx.objectStore('private').put(
        {
          ...old,
          dirty: old.dirty || hasLibraryData(migrated),
          pdfs: [
            ...new Set([
              ...old.pdfs,
              ...migrated.documents.filter((d) => !d.hash.startsWith('legacy:')).map((d) => d.id),
            ]),
          ],
          files: [
            ...new Set([
              ...(old.files || []),
              ...Object.keys(migrated.monty?.attachments || {}),
              ...Object.keys(migrated.monty?.banks || {}),
            ]),
          ],
        },
        'cloud',
      );
      await tx.objectStore('private').put(true, 'native-cloud-migrated');
      await tx.done;
    }
    value = await db.get('state', 'current');
  } else value = await (await browser()).get('state', 'current');
  if (!value && offline) {
    const data = document.getElementById('monty-offline-data')?.textContent?.trim();
    if (!data) throw new Error('Download an offline copy from Monty Settings first.');
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const { importBackup } = await import('./backup');
    value = await importBackup(new File([bytes], 'Monty.zip', { type: 'application/zip' }));
  }
  const local = upgradeState(value ? (stateSchema.parse(value) as State) : emptyState());
  const restored = hosted ? await restoreCloud(local) : local;
  const result = await restoreTimers(restored);
  if (
    result.version === 2 &&
    (!value || (value as State).version !== 2 || JSON.stringify(value) !== JSON.stringify(local))
  )
    await saveState(result);
  return result;
}
export function saveState(state: State, previous?: State): Promise<void> {
  if (hosted) {
    pendingLocalWrites++;
    showSync('Saving online…');
  }
  const snapshot = JSON.stringify(state);
  const write = writes
    .catch(() => {})
    .then(async () => {
      {
        const db = await browser();
        const tx = db.transaction(['state', 'private'], 'readwrite');
        const stored: State | undefined = await tx.objectStore('state').get('current');
        const incoming = JSON.parse(snapshot) as State;
        const next =
          hosted && previous && stored ? mergeCloudState(previous, incoming, stored) : incoming;
        await tx.objectStore('state').put(next, 'current');
        if (hosted) {
          const m: CloudMeta = (await tx.objectStore('private').get('cloud')) ?? initialMeta();
          await tx.objectStore('private').put({ ...m, dirty: true, seq: m.seq + 1 }, 'cloud');
        }
        await tx.done;
        if (hosted) {
          if (JSON.stringify(next) !== snapshot) publishState(next);
          channel?.postMessage('changed');
          scheduleCloud();
        }
      }
    })
    .finally(() => {
      if (hosted) pendingLocalWrites--;
    });
  writes = write;
  return write;
}
function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 16384)
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(binary);
}
export async function savePdf(id: string, bytes: Uint8Array) {
  {
    await (await browser()).put('pdfs', bytes, id);
    if (hosted)
      await editMeta((m) => ({
        ...m,
        pdfs: [...new Set([...m.pdfs, id])],
        deleted: m.deleted.filter((x) => x !== id),
      }));
  }
}
export async function readPdf(id: string): Promise<Uint8Array> {
  {
    let bytes = await (await browser()).get('pdfs', id);
    if (!bytes && native) {
      try {
        const r = await Filesystem.readFile({ path: `pdfs/${id}.pdf`, directory: Directory.Data });
        bytes =
          r.data instanceof Blob
            ? new Uint8Array(await r.data.arrayBuffer())
            : Uint8Array.from(atob(r.data), (c) => c.charCodeAt(0));
        await (await browser()).put('pdfs', bytes, id);
      } catch {
        /* It may be available from the shared online library. */
      }
    }
    if (!bytes && hosted) {
      const r = await cloudFetch('pdfs/' + encodeURIComponent(id), {}, 120000);
      if (!r.ok || !r.headers.get('content-type')?.includes('application/pdf'))
        throw new Error('Could not download this PDF from your account. Try again when online.');
      bytes = new Uint8Array(await r.arrayBuffer());
      await (await browser()).put('pdfs', bytes, id);
    }
    if (!bytes) throw new Error('The original PDF is missing. Restore a complete backup.');
    return new Uint8Array(bytes);
  }
}
export async function removePdf(id: string) {
  if (native)
    await Filesystem.deleteFile({ path: `pdfs/${id}.pdf`, directory: Directory.Data }).catch(
      () => {},
    );
  {
    await (await browser()).delete('pdfs', id);
    if (hosted) {
      await editMeta((m) => ({
        ...m,
        deleted: [...new Set([...m.deleted, id])],
        pdfs: m.pdfs.filter((x) => x !== id),
      }));
      scheduleCloud();
    }
  }
}
export async function getToken(): Promise<string | null> {
  return native
    ? (await SecureStore.get()).value
    : ((await (await browser()).get('private', 'token')) ?? null);
}
export async function setToken(value: string) {
  if (native) await SecureStore.set({ value });
  else await (await browser()).put('private', value, 'token');
}
export async function clearToken() {
  if (native) await SecureStore.remove();
  else await (await browser()).delete('private', 'token');
}
export async function download(bytes: Uint8Array, name: string, type: string) {
  if (native) {
    const file = await Filesystem.writeFile({
      path: name,
      data: base64(bytes),
      directory: Directory.Cache,
    });
    await Share.share({ title: name, url: file.uri, dialogTitle: 'Save a backup' });
  } else {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}
export async function requestPersistentStorage() {
  if (!native && navigator.storage?.persist) await navigator.storage.persist();
}

type CloudMeta = {
  etag: string | null;
  base?: State;
  dirty: boolean;
  seq: number;
  pdfs: string[];
  deleted: string[];
  files?: string[];
  fileDeletes?: string[];
};
const initialMeta = (): CloudMeta => ({ etag: null, dirty: false, seq: 0, pdfs: [], deleted: [] });
function hasLibraryData(s: State) {
  const defaults = upgradeState(emptyState()).monty!.folders;
  return !!(
    s.documents.length ||
    Object.keys(s.entries).length ||
    s.tests.length ||
    Object.keys(s.monty?.attachments || {}).length ||
    Object.keys(s.monty?.banks || {}).length ||
    Object.values(s.monty?.folders || {}).some(
      (f) => !defaults[f.id] || f.name !== defaults[f.id].name || f.pinned,
    )
  );
}
let metaWrites: Promise<unknown> = Promise.resolve();
function editMeta(update: (m: CloudMeta) => CloudMeta): Promise<CloudMeta> {
  const next = metaWrites
    .catch(() => {})
    .then(async () => {
      const db = await browser();
      const tx = db.transaction('private', 'readwrite');
      const m = update((await tx.store.get('cloud')) ?? initialMeta());
      await tx.store.put(m, 'cloud');
      await tx.done;
      return m;
    });
  metaWrites = next;
  return next;
}
let status = 'Opening online backup…';
export const syncStatus = () => status;
function showSync(value: string) {
  if (status === value) return;
  status = value;
  window.dispatchEvent(new Event('vocab:sync'));
}
let timer: ReturnType<typeof setTimeout> | undefined, syncing: Promise<void> | undefined;
function scheduleCloud(delay = 650) {
  if (timer) clearTimeout(timer);
  showSync('Saving online…');
  timer = setTimeout(() => {
    timer = undefined;
    void syncNow();
  }, delay);
}
async function cloudFetch(path: string, options: RequestInit = {}, timeout = 20000) {
  const controller = new AbortController(),
    t = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await siteFetch(path, { ...options, signal: controller.signal });
    if (response.status === 401)
      throw new Error(
        mobileCloud ? 'Connect this phone again in Settings.' : 'Sign in again to sync.',
      );
    return response;
  } finally {
    clearTimeout(t);
  }
}
async function onlineState() {
  const response = await cloudFetch('state', {}, 10000);
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
    throw new Error('Online backup is unavailable.');
  const json = await response.json();
  return {
    state: json.state ? upgradeState(stateSchema.parse(json.state) as State) : null,
    etag: (json.revision as string | null) ?? response.headers.get('etag'),
  };
}
const channel =
  hosted && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('vocabmaster-state')
    : undefined;
function publishState(state: State) {
  window.dispatchEvent(new CustomEvent('vocab:state', { detail: state }));
}
if (channel)
  channel.onmessage = () => {
    void writes
      .catch(() => {})
      .then(async () => {
        const latest: State | undefined = await (await browser()).get('state', 'current');
        if (latest) publishState(latest);
      });
  };
async function restoreCloud(local: State): Promise<State> {
  if (mobileCloud && !(await mobileConnection())) {
    showSync('Connect Android in Settings to sync your web library');
    return local;
  }
  try {
    const remote = await onlineState();
    if (remote.state) {
      await reconcile(remote);
      const db = await browser(),
        m: CloudMeta = (await db.get('private', 'cloud')) ?? initialMeta();
      if (m.dirty || m.pdfs.length || m.deleted.length || m.files?.length || m.fileDeletes?.length)
        scheduleCloud();
      else showSync('Saved online');
      return (await db.get('state', 'current')) ?? local;
    }
    await editMeta((old) => ({
      ...old,
      etag: null,
      base: undefined,
      dirty: hasLibraryData(local) || old.dirty,
    }));
    if (hasLibraryData(local)) scheduleCloud();
    else showSync('Online backup ready');
  } catch {
    showSync('Saved on phone · online backup pending');
  }
  return local;
}
// A single IndexedDB transaction also protects changes from another tab.
async function reconcile(remote: { state: State | null; etag: string | null }) {
  const work = writes
    .catch(() => {})
    .then(async () => {
      if (!remote.state) return;
      const db = await browser(),
        tx = db.transaction(['state', 'private'], 'readwrite');
      const m: CloudMeta = (await tx.objectStore('private').get('cloud')) ?? initialMeta();
      const local: State = (await tx.objectStore('state').get('current')) ?? emptyState();
      const output = m.dirty
        ? mergeCloudState(m.base && upgradeState(m.base), upgradeState(local), remote.state)
        : remote.state;
      await tx.objectStore('state').put(output, 'current');
      await tx.objectStore('private').put(
        {
          ...m,
          etag: remote.etag,
          base: remote.state,
          dirty: JSON.stringify(output) !== JSON.stringify(remote.state),
          seq: m.seq + 1,
        },
        'cloud',
      );
      await tx.done;
      if (JSON.stringify(output) !== JSON.stringify(local)) {
        publishState(output);
        channel?.postMessage('changed');
      }
    });
  writes = work;
  await work;
}
export function syncNow(): Promise<void> {
  if (!hosted) return Promise.resolve();
  if (syncing) return syncing;
  const perform = async () => {
    await writes;
    await metaWrites;
    if (mobileCloud && !(await mobileConnection())) {
      showSync('Connect Android in Settings to sync your web library');
      return;
    }
    const db = await browser(),
      m: CloudMeta = (await db.get('private', 'cloud')) ?? initialMeta();
    let state: State = (await db.get('state', 'current')) ?? emptyState();
    if (
      !m.dirty &&
      !m.pdfs.length &&
      !m.deleted.length &&
      !m.files?.length &&
      !m.fileDeletes?.length
    ) {
      try {
        await reconcile(await onlineState());
        const latest: CloudMeta = (await db.get('private', 'cloud')) ?? initialMeta();
        if (latest.dirty || pendingLocalWrites) scheduleCloud();
        else showSync('Saved online');
      } catch {
        showSync('Saved on phone · online backup pending');
      }
      return;
    }
    showSync('Saving online…');
    try {
      for (const id of m.pdfs) {
        const bytes = await readPdf(id);
        if (!bytes) throw new Error('A pending PDF is missing.');
        await uploadBinary(
          'pdfs/' + encodeURIComponent(id),
          bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
          'application/pdf',
          cloudFetch,
          uploadCheckpoints,
        );
      }
      for (const id of m.files ?? []) {
        const file = await (await assets()).get('files', id);
        if (!file) throw new Error('Pending attachment missing');
        await uploadBinary(
          'files/' + encodeURIComponent(id),
          file.blob ?? file.bytes,
          file.mime,
          cloudFetch,
          uploadCheckpoints,
        );
      }
      let response = await cloudFetch(
        'state',
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(m.etag ? { 'If-Match': m.etag } : { 'If-None-Match': '*' }),
          },
          body: JSON.stringify(state),
        },
        45000,
      );
      // A changed revision is normal when another tab saved. Merge and retry.
      let savedSeq = m.seq;
      for (let attempt = 0; response.status === 412 && attempt < 4; attempt++) {
        await reconcile(await onlineState());
        await writes;
        await metaWrites;
        const latest: CloudMeta = (await db.get('private', 'cloud')) ?? initialMeta();
        state = (await db.get('state', 'current')) ?? emptyState();
        savedSeq = latest.seq;
        response = await cloudFetch(
          'state',
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...(latest.etag ? { 'If-Match': latest.etag } : { 'If-None-Match': '*' }),
            },
            body: JSON.stringify(state),
          },
          45000,
        );
      }
      if (response.status === 412)
        throw new Error('Another save is in progress. Retrying shortly.');
      const receipt = response.ok ? await response.json() : null;
      const revision = receipt?.revision ?? response.headers.get('etag');
      if (
        !response.ok ||
        !response.headers.get('content-type')?.includes('application/json') ||
        !receipt?.ok ||
        !revision
      )
        throw new Error('Online save failed.');
      await editMeta((old) => ({
        ...old,
        etag: revision,
        base: state,
        dirty: old.seq !== savedSeq,
        pdfs: old.pdfs.filter((id) => !m.pdfs.includes(id)),
        files: (old.files ?? []).filter((id) => !(m.files ?? []).includes(id)),
      }));
      for (const id of m.deleted) {
        await abortBinary('pdfs/' + encodeURIComponent(id), cloudFetch, uploadCheckpoints);
        const removed = await cloudFetch('pdfs/' + encodeURIComponent(id), { method: 'DELETE' });
        if (removed.ok)
          await editMeta((old) => ({ ...old, deleted: old.deleted.filter((x) => x !== id) }));
      }
      for (const id of m.fileDeletes ?? []) {
        await abortBinary('files/' + encodeURIComponent(id), cloudFetch, uploadCheckpoints);
        const deleted = await cloudFetch('files/' + encodeURIComponent(id), { method: 'DELETE' });
        if (deleted.ok)
          await editMeta((old) => ({
            ...old,
            fileDeletes: (old.fileDeletes ?? []).filter((x) => x !== id),
          }));
      }
      const latest: CloudMeta = (await db.get('private', 'cloud')) ?? initialMeta();
      if (
        pendingLocalWrites ||
        latest.dirty ||
        latest.pdfs.length ||
        latest.deleted.length ||
        latest.files?.length ||
        latest.fileDeletes?.length
      )
        scheduleCloud();
      else showSync('Saved online');
    } catch {
      showSync('Saved on phone · online backup pending');
      if (navigator.onLine && document.visibilityState === 'visible')
        timer = setTimeout(() => void syncNow(), 30000);
    }
  };
  syncing = (async () => {
    if (navigator.locks) await navigator.locks.request('vocabmaster-cloud', perform);
    else await perform();
  })().finally(() => {
    syncing = undefined;
  });
  return syncing;
}
export async function useOnlineCopy() {
  const remote = await onlineState();
  if (!remote.state) throw new Error('There is no online copy yet.');
  const db = await browser();
  await db.put('state', remote.state, 'current');
  await editMeta(() => ({ ...initialMeta(), etag: remote.etag, base: remote.state! }));
  publishState(remote.state);
  showSync('Saved online');
}
if (hosted && typeof window !== 'undefined') {
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('focus', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  // Both open devices receive changes without requiring navigation or a reload.
  setInterval(() => {
    if (navigator.onLine && document.visibilityState === 'visible') void syncNow();
  }, 15000);
  window.addEventListener('monty:connection', () => void syncNow());
}

const uploadCheckpoints = {
  get: async (path: string) => (await browser()).get('private', 'upload:' + path),
  put: async (path: string, value: unknown) =>
    (await browser()).put('private', value, 'upload:' + path),
  delete: async (path: string) => (await browser()).delete('private', 'upload:' + path),
};
export async function saveAttachment(id: string, bytes: Uint8Array | Blob, mime: string) {
  await (
    await assets()
  ).put('files', bytes instanceof Blob ? { blob: bytes, mime } : { bytes, mime }, id);
  if (hosted) {
    await editMeta((m) => ({
      ...m,
      files: [...new Set([...(m.files ?? []), id])],
      fileDeletes: (m.fileDeletes ?? []).filter((x) => x !== id),
    }));
    scheduleCloud();
  }
}
// Only inspect local storage: Android streams remote originals itself.
export async function readLocalFileBlob(id: string, legacy = false): Promise<Blob | null> {
  if (legacy) {
    const bytes = await (await browser()).get('pdfs', id);
    return bytes ? new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }) : null;
  }
  const file = await (await assets()).get('files', id);
  return file ? file.blob || new Blob([new Uint8Array(file.bytes)], { type: file.mime }) : null;
}
export async function readAttachment(id: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const db = await assets();
  let file = await db.get('files', id);
  if (!file && hosted) {
    const r = await cloudFetch('files/' + encodeURIComponent(id), {}, 120000);
    if (!r.ok) throw new Error('Attachment unavailable. Reconnect and retry.');
    file = {
      blob: await r.blob(),
      mime: r.headers.get('content-type') ?? 'application/octet-stream',
    };
    await db.put('files', file, id);
  }
  if (!file) throw new Error('Attachment is not downloaded on this device.');
  return {
    mime: file.mime,
    bytes: file.blob ? new Uint8Array(await file.blob.arrayBuffer()) : new Uint8Array(file.bytes),
  };
}
export async function removeAttachment(id: string) {
  await (await assets()).delete('files', id);
  if (hosted) {
    await editMeta((m) => ({
      ...m,
      files: (m.files ?? []).filter((x) => x !== id),
      fileDeletes: [...new Set([...(m.fileDeletes ?? []), id])],
    }));
    scheduleCloud();
  }
}
export async function saveJob(id: string, value: unknown) {
  await (await assets()).put('jobs', value, id);
}
export async function readJob<T>(id: string): Promise<T | undefined> {
  return (await assets()).get('jobs', id);
}
export async function saveClock(id: string, clock: AttemptClock) {
  await (await assets()).put('timers', clock, id);
}
export async function restoreTimers(state: State) {
  const next = structuredClone(state),
    db = await assets();
  for (const t of next.tests)
    if (t.draft) {
      const c: AttemptClock | undefined = await db.get('timers', t.draft.id ?? t.id);
      if (c && c.updatedAt > (t.draft.clock?.updatedAt ?? 0))
        t.draft.clock = { ...c, paused: true };
    }
  for (const t of Object.values(next.monty?.tests ?? {}))
    if (t.draft) {
      const c: AttemptClock | undefined = await db.get('timers', t.draft.id);
      if (c && c.updatedAt > t.draft.clock.updatedAt) t.draft.clock = { ...c, paused: true };
    }
  return next;
}

export async function replaceState(state: State) {
  await writes;
  if (hosted) {
    const remote = await onlineState();
    await editMeta((m) => ({
      ...m,
      etag: remote.etag,
      base: remote.state ?? upgradeState(emptyState()),
      dirty: true,
      seq: m.seq + 1,
    }));
  }
  const db = await assets();
  await db.clear('timers');
  await saveState(state);
  publishState(state);
  channel?.postMessage('changed');
}
