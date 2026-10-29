import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  cache: vi.fn(),
  begin: vi.fn(),
  append: vi.fn(),
  finish: vi.fn(),
  cancel: vi.fn(),
  remote: vi.fn(),
  local: vi.fn(),
  read: vi.fn(),
  download: vi.fn(),
  connection: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => ({
    openCached: mocks.cache,
    begin: mocks.begin,
    append: mocks.append,
    finish: mocks.finish,
    cancel: mocks.cancel,
    download: mocks.remote,
  }),
}));
vi.mock('../src/services/cloud', () => ({ mobileConnection: mocks.connection }));
vi.mock('../src/storage/repository', () => ({
  readLocalFileBlob: mocks.local,
  readAttachment: mocks.read,
  readPdf: mocks.read,
  download: mocks.download,
}));
import { openPdfInApp, openImageInApp } from '../src/services/openPdf';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cache.mockResolvedValue({ opened: false });
  mocks.begin.mockResolvedValue({ session: 'transfer' });
  mocks.append.mockResolvedValue(undefined);
  mocks.finish.mockResolvedValue(undefined);
  mocks.cancel.mockResolvedValue(undefined);
  mocks.local.mockResolvedValue(new Blob(['%PDF-original']));
  mocks.connection.mockResolvedValue({ token: 'a'.repeat(64) });
  mocks.remote.mockResolvedValue(undefined);
});
it('reopens a native cached PDF without reading or copying any original bytes', async () => {
  mocks.cache.mockResolvedValue({ opened: true });
  await openPdfInApp({ id: 'pdf', name: 'Notes' }, vi.fn());
  expect(mocks.local).not.toHaveBeenCalled();
  expect(mocks.begin).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
});
it('transfers local blobs in bounded chunks without materializing the whole file', async () => {
  const blob = new Blob([new Uint8Array(1300000).fill(7)]);
  vi.spyOn(blob, 'arrayBuffer').mockRejectedValue(new Error('Whole-file reads forbidden'));
  mocks.local.mockResolvedValue(blob);
  await openPdfInApp({ id: 'pdf', name: 'Notes' }, vi.fn());
  expect(mocks.append).toHaveBeenCalledTimes(3);
  expect(mocks.append.mock.calls.every(([o]) => o.data.length <= 700000)).toBe(true);
  expect(mocks.append.mock.calls.reduce((n, [o]) => n + atob(o.data).length, 0)).toBe(blob.size);
  expect(mocks.finish).toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.download).not.toHaveBeenCalled();
});
it('streams uncached remote files through the native authenticated downloader', async () => {
  mocks.local.mockResolvedValue(null);
  await openPdfInApp({ id: 'pdf', name: 'Notes' }, vi.fn());
  expect(mocks.remote).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'pdf', mime: 'application/pdf', token: 'a'.repeat(64) }),
  );
  expect(mocks.read).not.toHaveBeenCalled();
});
it('opens images through the same cache and bounded transfer path', async () => {
  await openImageInApp({ id: 'image', name: 'photo.png', mime: 'image/png' }, vi.fn());
  expect(mocks.finish).toHaveBeenCalledWith({ session: 'transfer', mime: 'image/png' });
});
it('cleans up incomplete copies and reports errors without sharing', async () => {
  mocks.append.mockRejectedValue(new Error('Storage unavailable'));
  const notify = vi.fn();
  await openPdfInApp({ id: 'pdf', name: 'Notes' }, notify);
  expect(mocks.cancel).toHaveBeenCalled();
  expect(mocks.finish).not.toHaveBeenCalled();
  expect(notify).toHaveBeenLastCalledWith('Storage unavailable');
});
