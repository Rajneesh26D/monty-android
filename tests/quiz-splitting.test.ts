import { expect, it } from 'vitest';
import { createExamSet, uniqueExamQuestions, startExam } from '../src/core/exams';
import {
  createTest,
  splitItems,
  splitSizes,
  splitTest,
  startAttempt,
  validSplit,
} from '../src/core/quiz';
import { blankEntry } from '../src/core/vocabulary';
import { stateSchema } from '../shared/state-schema';
import { emptyState } from '../shared/types';
import { upgradeState } from '../shared/migrate';
import type { MCQ } from '../shared/monty';

const questions = (total: number): MCQ[] =>
  Array.from({ length: total }, (_, i) => ({
    id: `q-${i}`,
    number: i + 1,
    stem: `Question ${i + 1}`,
    meaningHi: '',
    passage: '',
    options: [
      { id: 'a', label: 'A', text: 'Choice A' },
      { id: 'b', label: 'B', text: 'Choice B' },
    ],
    answerId: 'a',
    page: 1,
    pages: [1],
    origin: 'pdf',
    answerOrigin: 'pdf',
    evidence: '',
    explanation: '',
  }));

it.each(['maths', 'grammar', 'vocab', 'reading'])(
  'splits one 100-question PDF into four independent quizzes in %s',
  (area) => {
    const original = questions(100);
    const tests = createExamSet(
      { folderId: area, attachmentId: 'one-pdf', bankId: 'bank', name: 'One PDF', source: 'pdf' },
      original,
      4,
    );
    expect(tests.map((t) => t.questionIds.length)).toEqual([25, 25, 25, 25]);
    expect(new Set(tests.map((t) => t.id)).size).toBe(4);
    expect(tests.flatMap((t) => t.questionIds)).toEqual(original.map((q) => q.id));
    expect(tests.every((t) => t.folderId === area && !t.draft && !t.latest)).toBe(true);
    const first = startExam(tests[0], 30),
      second = startExam(tests[1], 5);
    expect(first.draft!.clock.durationMs).toBe(1800000);
    expect(second.draft!.clock.durationMs).toBe(300000);
    first.draft!.answers[first.questionIds[0]] = 'a';
    expect(second.draft!.answers).toEqual({});
  },
);

it.each(['pdf', 'combined', 'bookmarks'] as const)(
  'supports ten quizzes from a %s source and keeps every question exactly once',
  (source) => {
    const tests = createExamSet(
      { folderId: 'grammar', attachmentId: source, bankId: 'bank', name: 'Source', source },
      questions(100),
      10,
    );
    expect(tests).toHaveLength(10);
    expect(tests.every((t) => t.questionIds.length === 10 && t.source === source)).toBe(true);
    expect(new Set(tests.flatMap((t) => t.questionIds)).size).toBe(100);
    const state = upgradeState(emptyState());
    state.monty!.tests = Object.fromEntries(tests.map((t) => [t.id, t]));
    expect(
      Object.keys(stateSchema.parse(JSON.parse(JSON.stringify(state))).monty!.tests),
    ).toHaveLength(10);
  },
);

it.each(['pdf', 'combined', 'bookmarks'] as const)(
  'splits vocabulary from %s with the same sizes and independent timers',
  (source) => {
    const entries = Array.from({ length: 100 }, (_, i) => ({
      ...blankEntry(`Word ${i}`),
      meaningEn: `Meaning ${i}`,
      synonyms: [{ term: 'Similar', explanation: '' }],
      antonyms: [{ term: 'Opposite', explanation: '' }],
    }));
    const test = createTest(entries, 'Vocabulary', source, [], 0);
    const parts = splitTest(test, 10);
    expect(parts.map((t) => t.questions.length)).toEqual(Array(10).fill(10));
    expect(new Set(parts.flatMap((t) => t.questions.map((q) => q.entry.id))).size).toBe(100);
    expect(startAttempt(parts[0], 20).draft!.clock!.remainingMs).toBe(1200000);
    expect(startAttempt(parts[1]).draft!.clock!.remainingMs).toBe(900000);
  },
);

it('deduplicates combined questions before splitting and preserves different passages', () => {
  const original = questions(10);
  const pool = uniqueExamQuestions([
    ...original,
    ...original.map((q) => ({ ...q, id: 'copy-' + q.id })),
    { ...original[0], id: 'different-passage', passage: 'Different reading passage' },
  ]);
  expect(pool).toHaveLength(11);
  expect(
    splitItems(pool, 4)
      .map((group) => group.length)
      .reduce((a, b) => a + b),
  ).toBe(11);
});

it('balances remainders without losing questions and supports one quiz per question', () => {
  expect(splitSizes(100, 4)).toEqual([25, 25, 25, 25]);
  expect(splitSizes(49, 5)).toEqual([10, 10, 10, 10, 9]);
  expect(splitItems(questions(100), 100).every((part) => part.length === 1)).toBe(true);
});

it.each([0, -1, NaN, Infinity, 1.5, 101])(
  'rejects invalid quiz counts (%s) before generating tests',
  (parts) => {
    expect(validSplit(100, parts)).toBe(false);
    expect(() => splitItems(questions(100), parts)).toThrow();
  },
);
