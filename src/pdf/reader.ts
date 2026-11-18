import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import PdfWorker from './worker?worker';
import { pageGraphics, type Bounds } from './graphics';
import { linesOf, type PageData, type TextItem } from './parser';
export async function openPdf(data: Uint8Array) {
  const port = new PdfWorker();
  const worker = pdfjs.PDFWorker.create({ port });
  const task = pdfjs.getDocument({ data, worker });
  const close = async () => {
    try {
      await task.destroy();
    } finally {
      worker.destroy();
      port.terminate();
    }
  };
  const pdf = await task.promise.catch(async (error) => {
    await close();
    if (error?.name === 'PasswordException')
      throw new Error('Unlock this PDF before importing it.');
    throw error;
  });
  return {
    count: pdf.numPages,
    async page(number: number): Promise<PageData> {
      const page = await pdf.getPage(number),
        viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: TextItem[] = content.items
        .filter((i) => 'str' in i)
        .map((i) => ({
          text: i.str,
          x: i.transform[4],
          y: viewport.height - i.transform[5],
          width: i.width,
          height: i.height,
          fontName: i.fontName,
        }));
      const text = linesOf(items).join('\n');
      const operators = text.trim().length >= 100 ? null : await page.getOperatorList();
      const imageOps = [
        pdfjs.OPS.paintImageXObject,
        pdfjs.OPS.paintInlineImageXObject,
        pdfjs.OPS.paintImageMaskXObject,
        pdfjs.OPS.constructPath,
      ];
      const result: PageData = {
        number,
        width: viewport.width,
        height: viewport.height,
        items,
        text,
        hasVisualContent: !!operators?.fnArray.some((op) => imageOps.includes(op)),
      };
      page.cleanup();
      return result;
    },
    async pages(onProgress?: (page: number, total: number) => void): Promise<PageData[]> {
      const pages: PageData[] = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        pages.push(await this.page(number));
        onProgress?.(number, pdf.numPages);
      }
      return pages;
    },
    async graphics(number: number) {
      const page = await pdf.getPage(number);
      try {
        return pageGraphics(await page.getOperatorList(), page.getViewport({ scale: 1 }).transform);
      } finally {
        page.cleanup();
      }
    },
    async image(number: number, bounds?: Bounds, maxScale = 2): Promise<string> {
      const page = await pdf.getPage(number),
        base = page.getViewport({ scale: 1 });
      const [x, y, right, bottom] = bounds ?? [0, 0, base.width, base.height];
      const scale = Math.min(maxScale, 1600 / Math.max(right - x, bottom - y));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil((right - x) * scale);
      canvas.height = Math.ceil((bottom - y) * scale);
      try {
        await page.render({
          canvas,
          viewport,
          transform: bounds ? [1, 0, 0, 1, -x * scale, -y * scale] : undefined,
        }).promise;
        return canvas.toDataURL('image/jpeg', 0.83);
      } finally {
        page.cleanup();
        canvas.width = canvas.height = 0;
      }
    },
    async textRegionImage(number: number, bounds: Bounds) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const [left, top, right, bottom] = bounds;
      const [x0, y0, x1, y1] = viewport.convertToViewportRectangle([
        left,
        viewport.height - bottom,
        right,
        viewport.height - top,
      ]);
      return this.image(
        number,
        [
          Math.max(0, Math.min(x0, x1)),
          Math.max(0, Math.min(y0, y1)),
          Math.min(viewport.width, Math.max(x0, x1)),
          Math.min(viewport.height, Math.max(y0, y1)),
        ],
        3,
      );
    },
    close,
  };
}
