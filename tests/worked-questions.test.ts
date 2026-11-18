import { expect, it } from 'vitest';
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pageGraphics } from '../src/pdf/graphics';
import { linesOf, type PageData, type TextItem } from '../src/pdf/parser';
import { workedQuestions } from '../src/pdf/workedQuestions';

const line = (text: string, y: number, x = 25): TextItem => ({
  text,
  x,
  y,
  height: 12,
  width: text.length * 6,
});
const page = (number: number, items: TextItem[]): PageData => ({
  number,
  items,
  width: 600,
  height: 800,
  text: linesOf(items).join('\n'),
  hasVisualContent: false,
});
it('reads highlighted inline answers and retains their printed solutions across a page break', async () => {
  const pages = [
    page(1, [line('1. What is the total?', 100), line('a) 10', 125), line('b) 14', 125, 125)]),
    page(2, [
      line('Solution: 6 + 8 = 14', 80),
      line('2. What is the difference?', 100),
      line('a) 4', 125),
      line('b) 0', 125, 125),
      line('Solution: 7 − 3 = 4', 145),
    ]),
  ];
  const answerBoxes = [
    [120, 116, 167, 130],
    [20, 116, 68, 130],
  ];
  const graphics = (number: number) =>
    Promise.resolve(
      pageGraphics(
        {
          fnArray: [OPS.setFillRGBColor, OPS.constructPath],
          argsArray: [['#bef3b1'], [OPS.fill, [], answerBoxes[number - 1]]],
        },
        [1, 0, 0, 1, 0, 0],
      ),
    );
  const result = await workedQuestions(pages, 'bank', graphics);
  expect(result?.bank.warnings).toEqual([]);
  expect(
    result?.bank.questions.map((q) => ({
      answer: q.answerId,
      options: q.options.map((o) => o.text),
      solution: q.sourceSolution,
    })),
  ).toEqual([
    { answer: 'B', options: ['10', '14'], solution: { text: '6 + 8 = 14', pages: [2] } },
    { answer: 'A', options: ['4', '0'], solution: { text: '7 − 3 = 4', pages: [2] } },
  ]);
});

it('leaves an unmarked multiple-choice answer for recovery with its original solution', async () => {
  const result = await workedQuestions(
    [
      page(1, [
        line('1. What is the total?', 100),
        line('a) 10', 125),
        line('b) 14', 125, 125),
        line('Worked solution: 6 + 8 = 14', 145),
      ]),
    ],
    'bank',
    async () => ({ images: [], fills: [] }),
  );
  expect(result?.bank.questions).toEqual([]);
  expect(result?.bank.warnings[0]).toMatch(/^Question 1:/);
  expect(result?.fragments[0].text).toContain('Solution: 6 + 8 = 14');
});
