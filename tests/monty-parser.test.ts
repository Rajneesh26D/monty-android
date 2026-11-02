import { repairMathBank } from '../src/core/repairMathBank';
import { englishMathText, flowMathText } from '../src/core/mathsText';
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { linesOf, type PageData } from '../src/pdf/parser';
import { MathsParser, IdiomsParser, mathItems } from '../src/pdf/content';
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
        fontName: i.fontName,
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
  const salary = bank.questions.find((q) => q.number === 57)!;
  expect(salary.stem.match(/\[\[frac:x−y\/y\]\]/g)).toHaveLength(2);
  expect(flowMathText(englishMathText(salary.stem))).toContain('value of ([[frac:x−y/y]] × 100)%?');
  expect(englishMathText(salary.stem)).not.toMatch(/[\ufffd\u{1D400}-\u{1D7FF}]/u);
  expect(salary.answerId).toBe('D');
  expect(salary.options.map((o) => o.text)).toEqual(['20', '22', '24', '25']);
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
it('extracts all 100 CENTUARY questions, exact answer grid and cross-column fractions', async () => {
  const all = await pages('century.pdf');
  const parser = new MathsParser();
  for (const p of all) parser.add(p);
  const bank = parser.finish('century');
  expect(bank.warnings).toEqual([]);
  expect(bank.questions.map((q) => q.number)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  const keys = [
    'BDBBCBCACA DDB CABB DAB'.replace(/ /g, ''),
    'CCCBADACAA DBCBDBCADB'.replace(/ /g, ''),
    'DACBCAADDB CCB CBADBAA'.replace(/ /g, ''),
    'BADBABABDD ADABAABBBB'.replace(/ /g, ''),
    'CBBBBBBBDB CBABB CACAC'.replace(/ /g, ''),
  ].join('');
  expect(keys).toHaveLength(100);
  expect(bank.questions.map((q) => q.answerId).join('')).toBe(keys);
  expect(
    bank.questions.every((q) => q.options.length === 4 && q.options.every((o) => o.text.trim())),
  ).toBe(true);
  expect(
    bank.questions.every(
      (q) => !q.stem.includes('+91') && q.options.every((o) => !o.text.includes('+91')),
    ),
  ).toBe(true);
  expect(bank.questions[90].options.map((o) => o.text)).toEqual(['8', '9', '6', '12']);
  expect(bank.questions[98].options.map((o) => o.text)).toEqual([
    '[[frac:5/9]]',
    '[[frac:7/11]]',
    '[[frac:3/7]]',
    '[[frac:4/9]]',
  ]);
  expect(bank.questions[99].stem).toMatch(/^A batsman scored 105 runs/);
  expect(bank.questions[99].options.map((o) => o.text)).toEqual(['40', '45', '50', '55']);
  expect(bank.questions[98].stem).not.toContain('batsman');
  const old = new MathsParser(mathItems, 2);
  for (const p of all) old.add(p);
  const previous = old.finish('century');
  expect(previous.questions).toHaveLength(97);
  expect(previous.warnings).toHaveLength(3);
  const current = structuredClone(previous);
  current.questions[0].stem = 'My edited question';
  const repaired = repairMathBank(current, previous, bank);
  expect(repaired.questions).toHaveLength(100);
  expect(repaired.warnings).toEqual([]);
  expect(repaired.questions[0].stem).toBe('My edited question');
  expect(repaired.questions.slice(1, 90)).toEqual(bank.questions.slice(1, 90));
  expect(repaired.questions.slice(0, 90).map((q) => q.answerId)).toEqual(
    current.questions.slice(0, 90).map((q) => q.answerId),
  );
  expect(repaired.questions.map((q) => q.id)).toEqual(bank.questions.map((q) => q.id));
  expect(previous.questions).toHaveLength(97);
}, 30000);
