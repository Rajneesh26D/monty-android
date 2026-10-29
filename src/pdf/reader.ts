import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import PdfWorker from './worker?worker';
import { linesOf, type PageData, type TextItem } from './parser';
pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
export async function openPdf(data: Uint8Array) {
  const pdf = await pdfjs.getDocument({ data }).promise;
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
        }));
      const operators = items.some((i) => i.text.trim()) ? null : await page.getOperatorList();
      const imageOps = [
        pdfjs.OPS.paintImageXObject,
        pdfjs.OPS.paintInlineImageXObject,
        pdfjs.OPS.paintImageMaskXObject,
      ];
      const result: PageData = {
        number,
        width: viewport.width,
        height: viewport.height,
        items,
        text: linesOf(items).join('\n'),
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
    async image(number: number): Promise<string> {
      const page = await pdf.getPage(number),
        base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: Math.min(2, 1600 / Math.max(base.width, base.height)),
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      return canvas.toDataURL('image/jpeg', 0.83);
    },
    close: () => pdf.destroy(),
  };
}
