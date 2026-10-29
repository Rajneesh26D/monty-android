import { type Entry } from '../../shared/types';
import { blankEntry, sourceExplanations } from '../core/vocabulary';
export const PARSER_VERSION = 2;
export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PageData {
  number: number;
  width: number;
  height: number;
  items: TextItem[];
  text: string;
  hasVisualContent: boolean;
}
const tidy = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .trim();
const noise = /aman\s*sir\s*english|SYN\s*\/\s*ANT\s*LECTURE/i;
export function linesOf(items: TextItem[]): string[] {
  const groups: { y: number; items: TextItem[] }[] = [];
  for (const it of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (!it.text.trim() || noise.test(it.text)) continue;
    let g = groups.find((g) => Math.abs(g.y - it.y) < Math.max(2.5, it.height * 0.16));
    if (!g) {
      g = { y: it.y, items: [] };
      groups.push(g);
    }
    g.items.push(it);
  }
  return groups
    .sort((a, b) => a.y - b.y)
    .map((g) => {
      let result = '',
        end = 0;
      for (const it of g.items.sort((a, b) => a.x - b.x)) {
        const gap = it.x - end;
        if (
          result &&
          gap > Math.max(0.8, it.height * 0.09) &&
          !/\s$/.test(result) &&
          !/^[\s,.;:)]/.test(it.text)
        )
          result += ' ';
        result += it.text;
        end = it.x + it.width;
      }
      return tidy(result);
    })
    .filter(Boolean);
}
export function splitMeaning(text: string): { meaningEn: string; meaningHi: string } {
  const hindi: string[] = [];
  const meaningEn = tidy(
    text.replace(/\(([^)]*[\u0900-\u097f][^)]*)\)/g, (_m, hi: string) => {
      hindi.push(tidy(hi));
      return ' ';
    }),
  );
  return { meaningEn, meaningHi: hindi.join('; ') };
}
const label =
  /^(mnemonics?|memory\s*tricks?|root\s*words?|synonyms?|antonyms?|e\s*\.\s*g\s*\.?|examples?)\s*(?:[:\-–—]\s*)*(.*)$/i;
const head = /^([A-Za-z][A-Za-z'’` -]{0,50}?)\s*:\s*[-–—]?\s*(.*)$/;
const relations = (s: string) =>
  s
    .split(/[,;•]/)
    .map((t) => tidy(t).replace(/\.$/, ''))
    .filter(Boolean)
    .map((term) => ({ term, explanation: '' }));
function parseSlide(page: PageData, documentId: string): Entry[] {
  const lines = linesOf(page.items);
  // Multi-entry layouts must go through discovery rather than silently losing later words.
  if (lines.filter((line) => head.test(line) && !label.test(line)).length !== 1) return [];
  let current: Entry | undefined,
    field: 'meaning' | 'mnemonic' | 'synonyms' | 'antonyms' | 'example' | undefined;
  const values: Record<string, string> = {};
  for (const line of lines) {
    const l = line.match(label);
    if (l) {
      const tag = l[1].toLowerCase();
      field = /^(mn|mem|root)/.test(tag)
        ? 'mnemonic'
        : tag.startsWith('syn')
          ? 'synonyms'
          : tag.startsWith('ant')
            ? 'antonyms'
            : 'example';
      values[field] = (values[field] || '') + ' ' + l[2];
      continue;
    }
    const h = line.match(head);
    if (h && !current) {
      current = blankEntry(h[1].replace(/`/g, '').trim());
      field = 'meaning';
      values.meaning = h[2];
      continue;
    }
    if (field) values[field] = (values[field] || '') + ' ' + line;
  }
  if (!current) return [];
  Object.assign(current, splitMeaning(tidy(values.meaning || '')));
  current.mnemonic = tidy(values.mnemonic || '');
  current.example = tidy(values.example || '');
  current.synonyms = relations(values.synonyms || '');
  current.antonyms = relations(values.antonyms || '');
  current.sources = [{ documentId, page: page.number }];
  for (const k of [
    'meaningEn',
    'meaningHi',
    'mnemonic',
    'example',
    'synonyms',
    'antonyms',
  ] as const)
    if (current[k].length) current.origins[k] = 'pdf';
  return [sourceExplanations(current)];
}
function parseConcise(page: PageData, documentId: string): Entry[] {
  if (page.width > page.height) return [];
  const result: Entry[] = [];
  for (const col of [0, 1]) {
    const left = (col * page.width) / 2,
      right = left + page.width / 2;
    const items = page.items.filter(
      (i) =>
        i.x >= left && i.x < right && i.y > 50 && i.y < page.height - 40 && !noise.test(i.text),
    );
    const candidates = items.filter(
      (i) =>
        i.x > left + page.width * 0.025 &&
        i.x < left + page.width * 0.17 &&
        /^[A-Za-z][A-Za-z'’`-]{1,35}\s*$/.test(i.text.trim()),
    );
    if (candidates.length < 4) continue;
    const heads = candidates.sort((a, b) => a.y - b.y);
    const wordColumnEnd = Math.max(...heads.map((h) => h.x + h.width)) + 3;
    for (let n = 0; n < heads.length; n++) {
      const h = heads[n],
        nextY = heads[n + 1]?.y ?? page.height - 35;
      const body = items.filter((i) => i.x > wordColumnEnd && i.y >= h.y - 3 && i.y < nextY - 3);
      const meaning = linesOf(body).join(' ');
      if (!/[\u0900-\u097f]/.test(meaning)) continue;
      const entry = blankEntry(h.text.trim().replace(/`/g, ''));
      Object.assign(entry, splitMeaning(meaning));
      entry.sources = [{ documentId, page: page.number }];
      entry.origins = { meaningEn: 'pdf', meaningHi: 'pdf' };
      result.push(entry);
    }
  }
  return result;
}
export function parsePages(
  pages: PageData[],
  documentId: string,
): { entries: Entry[]; unknownPages: number[] } {
  const entries: Entry[] = [],
    unknownPages: number[] = [];
  for (const page of pages) {
    const found = parseConcise(page, documentId);
    const parsed = found.length ? found : parseSlide(page, documentId);
    if (parsed.length) entries.push(...parsed);
    else if (page.text.replace(/\s/g, '').length > 20 || page.hasVisualContent)
      unknownPages.push(page.number);
  }
  return { entries, unknownPages };
}
