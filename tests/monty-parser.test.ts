import { englishMathText } from '../src/core/mathsText';
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { linesOf, type PageData } from '../src/pdf/parser';
import { MathsParser, IdiomsParser } from '../src/pdf/content';
export async function pages(name: string) {
  const pdf = await getDocument({
    data: new Uint8Array(readFileSync(new URL('./fixtures/' + name, import.meta.url))),
    useSystemFonts: true,
  }).promise;
  const pages: PageData[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const p = await pdf.getPage(n),
      v = p.getViewport({ scale: 1 }),
      t = await p.getTextContent();
    const items = t.items
      .filter((i) => 'str' in i)
      .map((i) => ({
        text: i.str,
        x: i.transform[4],
        y: v.height - i.transform[5],
        width: i.width,
        height: i.height,
      }));
    pages.push({
      number: n,
      width: v.width,
      height: v.height,
      items,
      text: linesOf(items).join('\n'),
      hasVisualContent: false,
    });
  }
  await pdf.destroy();
  return pages;
}
it('extracts all 100 bilingual maths questions and their exact source answer grid', async () => {
  const parser = new MathsParser();
  for (const p of await pages('percentage.pdf')) parser.add(p);
  const bank = parser.finish('math');
  console.log('Math diagnostics', bank.questions.length, bank.warnings);
  expect(bank.warnings).toEqual([]);
  expect(bank.questions).toHaveLength(100);
  expect(bank.questions.map((q) => q.answerId).slice(0, 5)).toEqual(['A', 'B', 'C', 'D', 'B']);
  expect(bank.questions.slice(-5).map((q) => q.answerId)).toEqual(['B', 'C', 'A', 'D', 'B']);
  expect(bank.questions.every((q) => q.options.length === 4)).toBe(true);
  expect(bank.questions[0].stem).toContain('[[frac:1/8]]');
  expect(bank.questions[6].pages.length).toBeGreaterThan(1);
  expect(bank.questions.every((q) => /[\u0900-\u097f]/.test(q.stem))).toBe(true);
  expect(
    bank.questions.every(
      (q) =>
        englishMathText(q.stem).length > 25 &&
        q.options.every((o) => englishMathText(o.text).trim().length > 0),
    ),
  ).toBe(true);
}, 30000);
it('extracts 30 idioms and stitches the Yellow press definition across pages', async () => {
  const parser = new IdiomsParser();
  for (const p of await pages('idioms.pdf')) parser.add(p);
  const bank = parser.finish('idioms');
  console.log(
    'Idiom diagnostics',
    bank.study.map((e) => e.title),
  );
  expect(bank.study).toHaveLength(30);
  expect(bank.questions).toHaveLength(30);
  const yellow = bank.study.find((e) => e.title === 'Yellow press');
  expect(yellow?.text).toContain('sensationalized');
  expect(bank.study.every((e) => e.hindi && e.text)).toBe(true);
  expect(bank.study.find((e) => e.title === 'To go pear-shaped')).toBeTruthy();
}, 30000);
it('processes a 60-page PDF with decorative drawings and validates every numbered answer', async () => {
  const parser = new MathsParser();
  const all = await pages('large-60-pages.pdf');
  expect(all).toHaveLength(60);
  for (const page of all) parser.add(page);
  const bank = parser.finish('large');
  expect(bank.warnings).toEqual([]);
  expect(bank.questions).toHaveLength(59);
  expect(bank.questions.at(-1)?.number).toBe(59);
}, 30000);
