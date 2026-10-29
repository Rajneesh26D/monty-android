import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { download, readAttachment, readPdf } from '../src/storage/repository';
import { isPdf, openPdfInApp } from '../src/services/openPdf';
vi.mock('../src/storage/repository', () => ({
  download: vi.fn(),
  readAttachment: vi.fn(),
  readPdf: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
const original = new TextEncoder().encode('%PDF-1.7\noriginal scanned page data');
const notify = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('navigator', {});
  vi.mocked(readAttachment).mockResolvedValue({ bytes: original, mime: 'application/pdf' });
  vi.mocked(readPdf).mockResolvedValue(original);
});
afterEach(() => vi.unstubAllGlobals());
it('passes the unchanged original PDF and a PDF filename to the system sheet', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { share, canShare: () => true });
  await openPdfInApp({ id: 'note', name: 'Renamed notes' }, notify);
  const file = share.mock.calls[0][0].files[0] as File;
  expect(file.name).toBe('Renamed notes.pdf');
  expect(file.type).toBe('application/pdf');
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(original);
  expect(download).not.toHaveBeenCalled();
});
it('does not download when the user cancels the system sheet', async () => {
  vi.stubGlobal('navigator', {
    canShare: () => true,
    share: vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')),
  });
  await openPdfInApp({ id: 'note', name: 'Notes.pdf' }, notify);
  expect(download).not.toHaveBeenCalled();
  expect(notify).toHaveBeenLastCalledWith('');
});
it('downloads the original if a cloud read outlives browser user activation', async () => {
  vi.stubGlobal('navigator', {
    canShare: () => true,
    share: vi.fn().mockRejectedValue(new DOMException('No activation', 'NotAllowedError')),
  });
  await openPdfInApp({ id: 'note', name: 'Notes.PDF' }, notify);
  expect(download).toHaveBeenCalledWith(original, 'Notes.PDF', 'application/pdf');
  expect(notify).toHaveBeenLastCalledWith(expect.stringContaining('Tap the download'));
});
it('downloads legacy vocabulary PDFs on browsers without file sharing', async () => {
  await openPdfInApp({ id: 'legacy', name: 'Vocabulary', legacy: true }, notify);
  expect(readPdf).toHaveBeenCalledWith('legacy');
  expect(readAttachment).not.toHaveBeenCalled();
  expect(download).toHaveBeenCalledWith(original, 'Vocabulary.pdf', 'application/pdf');
});
it('falls back to download when the browser cannot share this file', async () => {
  const share = vi.fn();
  vi.stubGlobal('navigator', { share, canShare: () => false });
  await openPdfInApp({ id: 'note', name: 'Notes.pdf' }, notify);
  expect(share).not.toHaveBeenCalled();
  expect(download).toHaveBeenCalledWith(original, 'Notes.pdf', 'application/pdf');
});
it('reports missing originals instead of opening an empty viewer', async () => {
  vi.mocked(readAttachment).mockRejectedValue(
    new Error('Attachment unavailable. Reconnect and retry.'),
  );
  await openPdfInApp({ id: 'missing', name: 'Notes' }, notify);
  expect(download).not.toHaveBeenCalled();
  expect(notify).toHaveBeenLastCalledWith('Attachment unavailable. Reconnect and retry.');
});
it('recognizes PDFs even when the upload MIME type is empty', () => {
  expect(isPdf('Notes.PDF', '')).toBe(true);
  expect(isPdf('Renamed notes', 'application/pdf')).toBe(true);
  expect(isPdf('Photo.jpg', 'image/jpeg')).toBe(false);
});
