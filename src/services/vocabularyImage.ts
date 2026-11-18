import type { SourceRef } from '../../shared/types';
import type { Bounds } from '../pdf/graphics';
import { positionedLines, type PageData } from '../pdf/parser';
import { openPdf } from '../pdf/reader';
import { readJob, readPdf, saveJob } from '../storage/repository';

function illustration(page: PageData, images: Bounds[], word: string): Bounds | undefined {
  const wordKey = word.normalize('NFKC').toLowerCase().replace(/[’`]/g, "'");
  const headings = positionedLines(page.items).flatMap((line) => {
    const text = line.text.normalize('NFKC').replace(/[’`]/g, "'");
    const head = text.match(/^(?:\d+[.)]\s*)?([\p{L}][\p{L}' -]{0,65}?)\s*[:–—]/u)?.[1];
    if (
      !head ||
      /^(?:root words?|examples?|e\.?g\.?|meaning|synonyms?|antonyms?|mnemonics?|memory tricks?)$/i.test(
        head.trim(),
      )
    )
      return [];
    return [{ y: line.y, word: head.trim().toLowerCase() }];
  });
  const anchor = headings.find((head) => head.word === wordKey);
  const standalone = page.items.find(
    (item) => item.text.normalize('NFKC').trim().toLowerCase() === wordKey,
  );
  const location = anchor ?? standalone;
  if (!location) return;
  const after = headings.find((head) => head.y > location.y + 5)?.y ?? page.height;
  const available = images.flatMap(([x, y, x2, y2]) => {
    const bounds: Bounds = [
      Math.max(0, x),
      Math.max(0, y),
      Math.min(page.width, x2),
      Math.min(page.height, y2),
    ];
    const width = bounds[2] - bounds[0],
      height = bounds[3] - bounds[1];
    const area = (width * height) / (page.width * page.height);
    if (area < 0.018 || area > 0.65 || width < 42 || height < 42) return [];
    if (headings.length > 1 && (bounds[1] < location.y - 18 || bounds[3] > after + 8)) return [];
    if (!anchor && (bounds[1] < location.y - 18 || bounds[3] > location.y + page.height * 0.28))
      return [];
    return [{ bounds, area }];
  });
  return available.sort((left, right) => right.area - left.area)[0]?.bounds;
}

type Job = {
  source: SourceRef;
  word: string;
  key: string;
  resolve: (image: string | null) => void;
};
const pending: Job[] = [];
const inFlight = new Map<string, Promise<string | null>>();
let working = false;

async function drain() {
  if (working) return;
  working = true;
  try {
    while (pending.length) {
      const id = pending[0].source.documentId;
      const pdf = await readPdf(id)
        .then(openPdf)
        .catch(() => undefined);
      try {
        for (let i = 0; i < pending.length;) {
          const job = pending[i];
          if (job.source.documentId !== id) {
            i++;
            continue;
          }
          pending.splice(i, 1);
          let result: string | null = null;
          if (pdf) {
            try {
              const n = job.source.page;
              const page = await pdf.page(n);
              const bounds = illustration(page, (await pdf.graphics(n)).images, job.word);
              if (bounds) result = await pdf.image(n, bounds);
              if (result) await saveJob(job.key, result);
            } catch {
              // The word remains usable if an original image is unavailable.
            }
          }
          job.resolve(result);
        }
      } finally {
        await pdf?.close().catch(() => {});
      }
    }
  } finally {
    working = false;
  }
}

export async function vocabularyImage(word: string, source: SourceRef) {
  const key = `vocab-image-v2-${source.documentId}-${source.page}-${word.toLowerCase()}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const result = readJob<string>(key)
    .catch(() => undefined)
    .then((cached) =>
      cached
        ? cached
        : new Promise<string | null>((resolve) => {
            pending.push({ source, word, key, resolve });
            void drain();
          }),
    );
  inFlight.set(key, result);
  try {
    return await result;
  } finally {
    inFlight.delete(key);
  }
}
