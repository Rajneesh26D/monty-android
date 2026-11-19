export const isPdf = (name: string, mime: string) =>
  mime.toLowerCase().includes('pdf') || /\.pdf$/i.test(name);
export type PdfSource = { id: string; name: string; legacy?: boolean };
export const pdfName = (name: string) => (/\.pdf$/i.test(name) ? name : name + '.pdf');

export async function openNativePdf(source: PdfSource, notify: (message: string) => void) {
  notify('Opening PDF…');
  try {
    const { openNativeFile } = await import('./openNativeFile');
    await openNativeFile({ ...source, name: pdfName(source.name), mime: 'application/pdf' });
    notify('');
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
