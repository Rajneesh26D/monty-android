import { beforeEach, expect, it, vi } from 'vitest';
import { openNativeFile } from '../src/services/openNativeFile';
import { isPdf, openNativePdf } from '../src/services/openPdf';

vi.mock('../src/services/openNativeFile', () => ({ openNativeFile: vi.fn() }));

const notify = vi.fn();
beforeEach(() => vi.resetAllMocks());

it('passes the original PDF reference to the native viewer with a PDF filename', async () => {
  await openNativePdf({ id: 'note', name: 'Renamed notes' }, notify);
  expect(openNativeFile).toHaveBeenCalledWith({
    id: 'note',
    name: 'Renamed notes.pdf',
    mime: 'application/pdf',
  });
  expect(notify).toHaveBeenLastCalledWith('');
});

it('retains the legacy source reference and reports a native read failure', async () => {
  vi.mocked(openNativeFile).mockRejectedValue(
    new Error('Attachment unavailable. Reconnect and retry.'),
  );
  await openNativePdf({ id: 'legacy', name: 'Vocabulary.PDF', legacy: true }, notify);
  expect(openNativeFile).toHaveBeenCalledWith({
    id: 'legacy',
    name: 'Vocabulary.PDF',
    legacy: true,
    mime: 'application/pdf',
  });
  expect(notify).toHaveBeenLastCalledWith('Attachment unavailable. Reconnect and retry.');
});

it('recognizes PDFs even when the upload MIME type is empty', () => {
  expect(isPdf('Notes.PDF', '')).toBe(true);
  expect(isPdf('Renamed notes', 'application/pdf')).toBe(true);
  expect(isPdf('Photo.jpg', 'image/jpeg')).toBe(false);
});
