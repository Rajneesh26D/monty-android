import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  write: vi.fn(),
  download: vi.fn(),
  read: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => ({ open: mocks.open }),
}));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: { writeFile: mocks.write },
}));
vi.mock('../src/storage/repository', () => ({
  download: mocks.download,
  readAttachment: mocks.read,
  readPdf: mocks.read,
}));
import { openPdfInApp, openImageInApp } from '../src/services/openPdf';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.write.mockResolvedValue({ uri: 'file:///cache/open-files/test/file.pdf' });
  mocks.open.mockResolvedValue(undefined);
  mocks.read.mockResolvedValue({
    bytes: new TextEncoder().encode('%PDF-original'),
    mime: 'application/pdf',
  });
});
it('opens original PDFs through the native VIEW chooser without sharing', async () => {
  await openPdfInApp({ id: 'pdf', name: 'Notes' }, vi.fn());
  expect(mocks.open).toHaveBeenCalledWith({
    uri: 'file:///cache/open-files/test/file.pdf',
    mime: 'application/pdf',
  });
  expect(mocks.write.mock.calls[0][0].path).toMatch(/^open-files\/[^/]+\/Notes.pdf$/);
  expect(atob(mocks.write.mock.calls[0][0].data)).toBe('%PDF-original');
  expect(mocks.download).not.toHaveBeenCalled();
});
it('opens images externally with their image MIME type', async () => {
  await openImageInApp({ id: 'image', name: 'photo.png', mime: 'image/png' }, vi.fn());
  expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({ mime: 'image/png' }));
  expect(mocks.download).not.toHaveBeenCalled();
});
it('reports missing viewers without falling back to a share sheet', async () => {
  mocks.open.mockRejectedValue(new Error('No compatible app is installed.'));
  const notify = vi.fn();
  await openPdfInApp({ id: 'pdf', name: 'Notes' }, notify);
  expect(notify).toHaveBeenLastCalledWith('No compatible app is installed.');
  expect(mocks.download).not.toHaveBeenCalled();
});
