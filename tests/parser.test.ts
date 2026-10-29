import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { linesOf, parsePages, splitMeaning, type PageData } from '../src/pdf/parser';
async function read(name: string): Promise<PageData[]> {
  const pdf = await getDocument({
    data: new Uint8Array(readFileSync(new URL('./fixtures/' + name, import.meta.url))),
    useSystemFonts: true,
  }).promise;
  const pages: PageData[] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const p = await pdf.getPage(number),
      v = p.getViewport({ scale: 1 }),
      tc = await p.getTextContent();
    const items = tc.items
      .filter((i) => 'str' in i)
      .map((i) => ({
        text: i.str,
        x: i.transform[4],
        y: v.height - i.transform[5],
        height: i.height,
        width: i.width,
      }));
    const ops = await p.getOperatorList();
    pages.push({
      number,
      width: v.width,
      height: v.height,
      items,
      text: linesOf(items).join('\n'),
      hasVisualContent: ops.fnArray.some((n) =>
        [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(n),
      ),
    });
  }
  await pdf.destroy();
  return pages;
}
describe('supplied PDF regression fixtures', () => {
  for (const [name, count] of [
    ['3-LEC-1-SLIDE.pdf', 48],
    ['2-English-Special-1-Anto_Syno.Lec-2_Vivid-1-.pdf', 58],
    ['4-LEC-2-CONCISE.pdf', 58],
  ] as const) {
    it(`${name}: extracts ${count} complete source meanings without mixing columns`, async () => {
      const pages = await read(name),
        result = parsePages(pages, 'source');
      expect(result.entries).toHaveLength(count);
      expect(result.unknownPages).toEqual([]);
      expect(result.entries.every((e) => e.meaningEn.length > 5)).toBe(true);
      // Derogatory's source slide has no Hindi; it must remain missing for AI completion.
      expect(
        result.entries.filter((e) => !/[\u0900-\u097f]/.test(e.meaningHi)).map((e) => e.word),
      ).toEqual(name.startsWith('3') ? ['Derogatory'] : []);
      expect(new Set(result.entries.map((e) => e.word)).size).toBe(count);
      if (name.startsWith('4')) {
        expect(result.entries.find((e) => e.word === 'Depose')?.meaningHi).toBe('पद से हटा देना');
        expect(result.entries.find((e) => e.word === 'Shrill')?.meaningEn).toContain('penetrating');
        expect(result.entries.every((e) => !e.synonyms.length && !e.antonyms.length)).toBe(true);
      } else {
        const labelledPages = pages
          .filter((p) => p.items.some((i) => /^(?:mnemonics?|root words?)$/i.test(i.text.trim())))
          .map((p) => p.number);
        expect(
          result.entries
            .filter((e) => labelledPages.includes(e.sources[0].page))
            .every((e) => !!e.mnemonic),
        ).toBe(true);
        // A same-baseline watermark must never discard a real field.
        if (name.startsWith('3')) {
          expect(result.entries.find((e) => e.word === 'Overstrung')?.mnemonic).toBe(
            'jiski strings jada kheeche hui hon',
          );
          expect(result.entries.find((e) => e.word === 'Decency')?.synonyms).toHaveLength(3);
        }
        if (name.startsWith('2'))
          expect(result.entries.find((e) => e.word === 'Joyless')?.synonyms).toHaveLength(3);
        expect(result.entries.every((e) => e.example.length > 10)).toBe(true);
        expect(
          result.entries.every((e) =>
            [...e.synonyms, ...e.antonyms].every((r) => !/(?:E\.g|example|Aman Sir)/i.test(r.term)),
          ),
        ).toBe(true);
        if (name.startsWith('2'))
          expect(result.entries.find((e) => e.word === 'Dearth')?.example).toContain('test scores');
      }
    }, 30000);
  }
});
it('preserves English parentheses and separately extracts wrapped Hindi', () => {
  expect(splitMeaning('(of a person) very calm (बहुत शांत)')).toEqual({
    meaningEn: '(of a person) very calm',
    meaningHi: 'बहुत शांत',
  });
});
it('routes unfamiliar multi-entry layouts and scans to AI instead of losing entries', () => {
  const items = [
    'Calm :- peaceful',
    'Synonyms:- serene, tranquil, quiet',
    'Antonyms:- agitated, restless, anxious',
    'Brisk :- quick and energetic',
  ].map((text, i) => ({ text, x: 20, y: 60 + i * 25, width: 350, height: 12 }));
  const page: PageData = {
    number: 1,
    width: 800,
    height: 600,
    items,
    text: linesOf(items).join('\n'),
    hasVisualContent: false,
  };
  expect(parsePages([page], 'd')).toEqual({ entries: [], unknownPages: [1] });
  expect(
    parsePages([{ ...page, items: [], text: '', hasVisualContent: true }], 'd').unknownPages,
  ).toEqual([1]);
});

it('removes watermark text items before joining vocabulary lines', () => {
  const items = [
    { text: 'Mnemonics :- remember this', x: 10, y: 50, width: 300, height: 20 },
    { text: 'Aman Sir English', x: 700, y: 51, width: 150, height: 18 },
  ];
  expect(linesOf(items)).toEqual(['Mnemonics :- remember this']);
});
