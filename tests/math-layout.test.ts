import { expect, it } from 'vitest';
import { mathItems, legacyMathItems, MATH_LAYOUT_VERSION } from '../src/pdf/content';
import { linesOf, type TextItem } from '../src/pdf/parser';
import { repairMathBank } from '../src/core/repairMathBank';
import type { Bank, MCQ } from '../shared/monty';
const item = (
  text: string,
  x: number,
  y: number,
  width: number,
  height = 10,
  fontName = 'body',
): TextItem => ({ text, x, y, width, height, fontName });
function expression() {
  return [
    item('Find the value of', 300, 100, 75),
    item('�', 380, 100, 5, 10, 'equation'),
    item('𝑥𝑥−𝑦𝑦', 385, 94.1, 13.77, 6.96, 'equation'),
    item('𝑦𝑦', 389.68, 105.02, 4.41, 6.96, 'equation'),
    item('× 100', 401.2, 100, 25.92),
    item('�', 427.12, 100, 4.88, 10, 'equation'),
    item('%?', 432, 100, 13),
  ];
}
it('rebuilds an algebraic fraction at the prose baseline and recovers its equation brackets', () => {
  const source = expression(),
    original = structuredClone(source);
  expect(linesOf(mathItems(source))).toEqual(['Find the value of ([[frac:x−y/y]] × 100)%?']);
  expect(source).toEqual(original);
  expect(linesOf(mathItems([...source].reverse()))).toEqual(linesOf(mathItems(source)));
  expect(linesOf(legacyMathItems(source)).join(' ')).toContain('𝑥𝑥−𝑦𝑦');
});
it('supports other variable fractions and retains numeric fractions and powers', () => {
  const source = [
    item('Calculate', 0, 100, 45),
    item('a+b', 50, 94, 14, 7),
    item('c', 55, 105, 4, 7),
    item('and x', 70, 100, 30),
    item('2', 101, 96, 3, 6),
    item('.', 106, 100, 3),
  ];
  const text = linesOf(mathItems(source)).join(' ');
  expect(text).toContain('[[frac:a+b/c]]');
  expect(text).toContain('x²');
});
it('does not erase unknown glyphs or collapse ordinary repeated letters or a correctly mapped math font', () => {
  const source = [
    item('The word book and xx', 0, 100, 110),
    item('�', 120, 100, 5),
    item('𝑥𝑥', 140, 100, 12, 10, 'correct-math'),
  ];
  const text = linesOf(mathItems(source)).join(' ');
  expect(text).toContain('book and xx');
  expect(text).toContain('�');
  expect(mathItems(source).at(-1)?.text).toBe('xx');
});
it('does not combine small text on different lines into a fraction', () => {
  const source = [
    item('Normal text', 0, 100, 100),
    item('More text', 0, 120, 100),
    item('x', 110, 94, 4, 7),
    item('y', 110, 135, 4, 7),
  ];
  expect(mathItems(source).some((i) => i.text.includes('[[frac:'))).toBe(false);
});

const question = (number: number, stem: string): MCQ => ({
  id: `existing-q${number}`,
  number,
  stem,
  meaningHi: '',
  passage: '',
  options: [
    { id: 'A', label: 'A', text: 'Original A' },
    { id: 'B', label: 'B', text: 'Original B' },
  ],
  answerId: 'A',
  page: 1,
  pages: [1],
  origin: 'pdf',
  answerOrigin: 'pdf',
  evidence: 'Source answer',
  explanation: '',
});
const bank = (questions: MCQ[]): Bank => ({
  version: 1,
  id: 'existing-bank',
  kind: 'maths',
  questions,
  study: [],
  warnings: [],
});
it('repairs unchanged imported text while preserving manual edits, IDs and answer keys', () => {
  const before = bank([question(1, 'Broken imported formula'), question(2, 'Other original')]);
  const corrected = structuredClone(before);
  corrected.questions[0].stem = '([[frac:x−y/y]] × 100)%';
  corrected.questions[0].options[0].text = '[[frac:1/2]]';
  corrected.questions[1].stem = 'Other corrected';
  const current = structuredClone(before);
  current.questions[0].answerId = 'B'; // An edited answer must remain the answer.
  current.questions[0].options[1].text = 'My edited choice';
  current.questions[1].stem = 'My edited question';
  const original = structuredClone(current),
    repaired = repairMathBank(current, before, corrected);
  expect(repaired.mathLayoutVersion).toBe(MATH_LAYOUT_VERSION);
  expect(repaired.questions[0].stem).toBe(corrected.questions[0].stem);
  expect(repaired.questions[0].options.map((o) => o.text)).toEqual([
    '[[frac:1/2]]',
    'My edited choice',
  ]);
  expect(repaired.questions[1].stem).toBe('My edited question');
  expect(repaired.questions.map((q) => q.id)).toEqual(current.questions.map((q) => q.id));
  expect(repaired.questions[0].answerId).toBe('B');
  expect(current).toEqual(original);
});
