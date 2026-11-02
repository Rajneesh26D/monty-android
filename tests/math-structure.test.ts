import { expect, it } from 'vitest';
import { MathsParser, mathItems } from '../src/pdf/content';
import { linesOf, type TextItem, type PageData } from '../src/pdf/parser';
import { repairMathBank } from '../src/core/repairMathBank';
const item = (text: string, x: number, y: number): TextItem => ({
  text,
  x,
  y,
  width: text.length * 5,
  height: 10,
});
function page(items: TextItem[]): PageData {
  return {
    number: 1,
    width: 600,
    height: 842,
    items,
    text: linesOf(items).join('\n'),
    hasVisualContent: false,
  };
}
const source = page([
  item('1.', 40, 100),
  item('First question?', 60, 100),
  item('a) One b) Two c) Three d) Four', 60, 785),
  item('2.', 320, 100),
  item('A second question?', 330, 100),
  item('a) Five b) Six c) Seven d) Eight', 330, 120),
  item('+91 1234567890', 370, 805),
  item('1', 300, 804),
  item('ANSWER KEY', 240, 810),
]);
const key = page([
  item('ANSWER KEY', 240, 650),
  item('1.', 40, 680),
  item('A', 40, 690),
  item('2.', 70, 680),
  item('C', 70, 690),
]);
function parse(version = 3) {
  const parser = new MathsParser(mathItems, version);
  parser.add(source);
  parser.add(key);
  return parser.finish('bank');
}
it('keeps low options above the footer and separates a question with no space after its number', () => {
  const bank = parse();
  expect(bank.warnings).toEqual([]);
  expect(bank.questions.map((q) => q.number)).toEqual([1, 2]);
  expect(bank.questions[0].options.map((o) => o.text)).toEqual(['One', 'Two', 'Three', 'Four']);
  expect(bank.questions[1].stem).toBe('A second question?');
  expect(bank.questions[1].answerId).toBe('C');
  expect(JSON.stringify(bank)).not.toContain('+91');
});
it('retains numeric question beginnings and does not treat decimal prose as a new heading', () => {
  const parser = new MathsParser();
  parser.add(
    page([
      item('1. 100 people?', 40, 100),
      item('1.25 is a decimal.', 60, 120),
      item('a) Yes b) No', 60, 140),
    ]),
  );
  parser.add(key);
  const bank = parser.finish('bank');
  expect(bank.questions[0].stem).toBe('100 people?\n1.25 is a decimal.');
});
it('restores omissions without deleting manual warnings or intentionally removed questions', () => {
  const previous = parse(2),
    corrected = parse();
  const current = { ...previous, warnings: [...previous.warnings, 'My review note'] };
  expect(repairMathBank(current, previous, corrected).warnings).toEqual(['My review note']);
  expect(repairMathBank(current, previous, corrected).questions).toHaveLength(2);
  const manuallyRemoved = { ...corrected, questions: corrected.questions.slice(0, 1) };
  expect(repairMathBank(manuallyRemoved, corrected, corrected).questions).toHaveLength(1);
});
