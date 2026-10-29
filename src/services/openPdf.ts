import { Capacitor } from '@capacitor/core';
import { download, readAttachment, readPdf } from '../storage/repository';

export const isPdf = (name: string, mime: string) =>
  mime.toLowerCase().includes('pdf') || /\.pdf$/i.test(name);

// Pass the original bytes to the device. Never rasterize a PDF for viewing.
export async function openPdfInApp(
  source: { id: string; name: string; legacy?: boolean },
  notify: (message: string) => void,
) {
  notify('Opening PDF…');
  try {
    const name = /\.pdf$/i.test(source.name) ? source.name : source.name + '.pdf';
    if (Capacitor.isNativePlatform()) {
      const { openNativeFile } = await import('./openNativeFile');
      await openNativeFile({ ...source, name, mime: 'application/pdf' });
      notify('');
      return;
    }
    const bytes = source.legacy
      ? await readPdf(source.id)
      : (await readAttachment(source.id)).bytes;
    if (!Capacitor.isNativePlatform() && navigator.share && navigator.canShare) {
      // Web Share opens the phone's system sheet. Cloud reads can outlive the
      // browser's user activation; in that case downloading still works.
      try {
        const file = new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: name });
          notify('');
          return;
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          notify('');
          return;
        }
      }
    }
    await download(bytes, name, 'application/pdf');
    notify(
      Capacitor.isNativePlatform()
        ? ''
        : 'PDF downloaded. Tap the download to open it in your PDF app.',
    );
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Could not open this PDF. Please retry.');
  }
}

export async function openImageInApp(
  source: { id: string; name: string; mime: string },
  notify: (message: string) => void,
) {
  notify('Opening image…');
  try {
    const { openNativeFile } = await import('./openNativeFile');
    const extension = source.name.split('.').at(-1)?.toLowerCase();
    const known: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      heic: 'image/heic',
      heif: 'image/heif',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
    };
    await openNativeFile({
      ...source,
      mime: source.mime.startsWith('image/') ? source.mime : known[extension || ''] || 'image/jpeg',
    });
    notify('');
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Could not open this image.');
  }
}
