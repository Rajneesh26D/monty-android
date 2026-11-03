import { expect, it, vi } from 'vitest';
import { QuestionParser } from '../src/pdf/questions';
import { linesOf, type PageData } from '../src/pdf/parser';
const page = (number: number, lines: string[]): PageData => {
  const items = lines.map((text, i) => ({ text, x: 40, y: 70 + i * 15, width: 200, height: 12 }));
  return {
    number,
    width: 600,
    height: 800,
    items,
    text: linesOf(items).join('\n'),
    hasVisualContent: false,
  };
};
export const source = page(1, [
  'Practice',
  '1. Identify (jury).',
  '1: collective noun',
  '2: common noun',
  '3: material noun',
  '4: abstract noun',
  '2. Identify (wooden).',
  '1: Adverb',
  '2: Noun',
  '3: Adjective',
  '4: Verb',
  '3. We spoke soft(a)/softly(b)/softness(c).',
]);
export const key = page(2, [
  'Answers',
  '1. Ans -1',
  '2. Ans: 3',
  '3. Ans-b',
  'Explanation-Softly qualifies spoke.',
]);
it('reads numbered labels, inline alternatives, separate numeric/letter keys and source explanations', () => {
  const parser = new QuestionParser();
  parser.add(source);
  parser.add(key);
  const bank = parser.finish('sheet');
  expect(bank.warnings).toEqual([]);
  expect(bank.questions).toHaveLength(3);
  expect(bank.questions.map((q) => q.answerId)).toEqual(['A', 'C', 'B']);
  expect(bank.questions[2].stem).toBe('We spoke _____.');
  expect(bank.questions[2].options.map((o) => o.text)).toEqual(['soft', 'softly', 'softness']);
  expect(bank.questions[2].explanation).toContain('Softly qualifies');
});
it('flags a missing middle choice instead of accepting a partial question as complete', () => {
  const broken = structuredClone(source);
  broken.items = broken.items.filter((i) => i.text !== '3: Adjective');
  const parser = new QuestionParser();
  parser.add(broken);
  parser.add(key);
  const bank = parser.finish('sheet');
  expect(bank.questions.map((q) => q.number)).toEqual([1, 3]);
  expect(bank.warnings).toEqual(['Question 2: check its options and answer key (page 1).']);
});
