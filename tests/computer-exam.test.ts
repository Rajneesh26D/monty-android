import { expect, it } from 'vitest';
import { examPalette, navigateAttempt } from '../src/core/computerExam';
import { startExam, finishExam } from '../src/core/exams';
import type { Bank, Exam } from '../shared/monty';
const ids = ['a', 'b', 'c', 'd', 'e'];
it('reports five mutually exclusive exam states, including answered and marked questions', () => {
  const palette = examPalette(
    ids,
    (id) => ['a', 'e'].includes(id),
    ['a', 'b', 'd'],
    ['d', 'e'],
    'b',
  );
  expect(palette.items.map((q) => q.status)).toEqual([
    'answered',
    'not-answered',
    'not-visited',
    'review',
    'answered-review',
  ]);
  expect(Object.values(palette.counts)).toEqual([1, 1, 1, 1, 1]);
});
it('marks and advances atomically, saves and unmarks on the last question, without losing responses', () => {
  const draft = {
    index: 0,
    visited: ['a'],
    marked: ['b'],
    answers: { a: 'A' },
    clock: { remainingMs: 800000 },
  };
  const review = navigateAttempt(draft, ['a', 'b'], 'review-next');
  expect(review).toMatchObject({
    index: 1,
    visited: ['a', 'b'],
    marked: ['b', 'a'],
    answers: { a: 'A' },
  });
  const save = navigateAttempt(review, ['a', 'b'], 'save-next');
  expect(save).toMatchObject({ index: 1, marked: ['a'], answers: { a: 'A' } });
  expect(save.clock).toEqual(draft.clock);
  expect(draft).toMatchObject({ index: 0, marked: ['b'] });
});
it('jumping retains review flags and rejects out of range questions', () => {
  const draft = { index: 0, marked: ['a'], answers: { a: 'A' } };
  expect(navigateAttempt(draft, ids, 'jump', 4)).toMatchObject({
    index: 4,
    marked: ['a'],
    visited: ['a', 'e'],
  });
  for (const index of [-1, 5, 0.5])
    expect(() => navigateAttempt(draft, ids, 'jump', index)).toThrow('Invalid question navigation');
});
it('scores an answered review question, leaves review-only questions unanswered and retains time spent', () => {
  const bank = { questions: ids.slice(0, 2).map((id) => ({ id, answerId: 'A' })) } as Bank;
  const test = startExam({
    id: 'test',
    name: 'Test',
    folderId: 'folder',
    attachmentId: 'pdf',
    bankId: 'bank',
    questionIds: ['a', 'b'],
    source: 'pdf',
    createdAt: 0,
  } as Exam);
  test.draft!.answers = { a: 'A' };
  test.draft!.marked = ['a', 'b'];
  test.draft!.clock.spent = { a: 1234 };
  const finished = finishExam(test, bank);
  expect(finished.latest).toMatchObject({
    correct: 1,
    unanswered: 1,
    wrong: 0,
    spent: { a: 1234 },
  });
});
