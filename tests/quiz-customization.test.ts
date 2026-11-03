import { afterEach, expect, it, vi } from 'vitest';
import type { Bank, MCQ } from '../shared/monty';
import { emptyState } from '../shared/types';
import { upgradeState } from '../shared/migrate';
import { stateSchema } from '../shared/state-schema';
import { defaultQuizCustomization } from '../shared/quiz-customization';
import { createExamSet, examQuestions, finishExam, startExam } from '../src/core/exams';
import {
  createTest,
  finishAttempt,
  quizSplitSizes,
  selectQuestions,
  splitTest,
  startAttempt,
} from '../src/core/quiz';
import { presentQuestions } from '../src/core/quizOrder';
import { blankEntry } from '../src/core/vocabulary';
import { mergeCloudState } from '../src/storage/merge';

const bank = (count = 60): Bank => ({
  id: 'sheet',
  kind: 'maths',
  version: 1,
  warnings: [],
  study: [],
  questions: Array.from({ length: count }, (_, i): MCQ => ({
    id: `q${i + 1}`,
    number: i + 1,
    stem: `Sheet question ${i + 1}`,
    meaningHi: '',
    passage: '',
    page: 1,
    pages: [1],
    origin: 'pdf',
    answerOrigin: 'pdf',
    evidence: '',
    explanation: '',
    answerId: 'b',
    options: ['a', 'b', 'c', 'd'].map((id) => ({
      id,
      label: id.toUpperCase(),
      text: `Choice ${id}`,
    })),
  })),
});
const vocabulary = (count = 60) =>
  Array.from({ length: count }, (_, i) => ({
    ...blankEntry(`Word ${i + 1}`),
    meaningEn: `Meaning ${i + 1}`,
    synonyms: ['Syn 1', 'Syn 2', 'Syn 3'].map((term) => ({ term, explanation: '' })),
    antonyms: ['Ant 1', 'Ant 2', 'Ant 3'].map((term) => ({ term, explanation: '' })),
  }));
const source = {
  folderId: 'maths-percentage',
  attachmentId: 'pdf',
  bankId: 'sheet',
  name: 'Sheet',
  source: 'pdf' as const,
};
afterEach(() => vi.restoreAllMocks());

it('selects the first N questions without consuming randomness', () => {
  const random = vi.spyOn(Math, 'random');
  const original = bank();
  expect(selectQuestions(original.questions, 15).map((q) => q.number)).toEqual(
    Array.from({ length: 15 }, (_, i) => i + 1),
  );
  expect(selectQuestions(original.questions, 0)).toEqual(original.questions);
  expect(random).not.toHaveBeenCalled();
});

it.each(['maths', 'grammar', 'vocab', 'reading'])(
  'keeps 60 questions in four consecutive groups of 15 in %s',
  (area) => {
    const random = vi.spyOn(Math, 'random');
    const original = bank();
    const before = structuredClone(original);
    const tests = createExamSet({ ...source, folderId: area }, original.questions, 1, 15);
    expect(tests).toHaveLength(4);
    tests.forEach((test, i) => {
      const started = startExam(test, 15, defaultQuizCustomization, original);
      const displayed = examQuestions(started, original);
      expect(displayed.map((q) => q.number)).toEqual(
        Array.from({ length: 15 }, (_, j) => i * 15 + j + 1),
      );
      expect(displayed[0].options).toEqual(before.questions[0].options);
    });
    expect(original).toEqual(before);
    expect(random).not.toHaveBeenCalled();
  },
);

it('preserves vocabulary word and option order when creating, splitting and starting quizzes', () => {
  const random = vi.spyOn(Math, 'random');
  const entries = vocabulary();
  const test = createTest(entries, 'Sheet', 'pdf', [], 0);
  const groups = splitTest(test, 1, 15);
  expect(groups).toHaveLength(4);
  groups.forEach((group, i) => {
    const started = startAttempt(group);
    const displayed = presentQuestions(started.questions, started.draft);
    expect(displayed.map((q) => q.entry.word)).toEqual(
      entries.slice(i * 15, (i + 1) * 15).map((e) => e.word),
    );
    expect(displayed[0].options.map((o) => o.term)).toEqual([
      'Syn 1',
      'Syn 2',
      'Syn 3',
      'Ant 1',
      'Ant 2',
      'Ant 3',
    ]);
  });
  expect(random).not.toHaveBeenCalled();
});

it.each([
  { shuffleQuestions: false, shuffleOptions: false },
  { shuffleQuestions: true, shuffleOptions: false },
  { shuffleQuestions: false, shuffleOptions: true },
  { shuffleQuestions: true, shuffleOptions: true },
])('applies question/option shuffling independently: %j', (settings) => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const original = bank(8);
  const test = createExamSet(source, original.questions, 1)[0];
  const started = startExam(test, 27, settings, original);
  const displayed = examQuestions(started, original);
  expect(displayed.map((q) => q.id)).toEqual(
    settings.shuffleQuestions ? ['q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q1'] : test.questionIds,
  );
  expect(displayed[0].options.map((o) => o.id)).toEqual(
    settings.shuffleOptions ? ['b', 'c', 'd', 'a'] : ['a', 'b', 'c', 'd'],
  );
  expect(displayed[0].options.map((o) => o.label)).toEqual(['A', 'B', 'C', 'D']);
  expect(started.questionIds).toEqual(test.questionIds);
  expect(started.draft!.clock.durationMs).toBe(27 * 60000);
  started.draft!.answers = Object.fromEntries(displayed.map((q) => [q.id, 'b']));
  expect(finishExam(started, original).latest!.correct).toBe(8);
});

it('gives each split quiz its own shuffle settings and timer without changing memberships', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const original = bank();
  const tests = createExamSet(source, original.questions, 4);
  const first = startExam(tests[0], 7, { shuffleQuestions: true, shuffleOptions: false }, original);
  const second = startExam(
    tests[1],
    35,
    { shuffleQuestions: false, shuffleOptions: true },
    original,
  );
  expect(new Set(first.draft!.questionOrder)).toEqual(new Set(tests[0].questionIds));
  expect(second.draft!.questionOrder).toEqual(tests[1].questionIds);
  expect(second.draft!.questionOrder![0]).toBe('q16');
  expect(first.draft!.clock.remainingMs).toBe(420000);
  expect(second.draft!.clock.remainingMs).toBe(2100000);
  expect(tests[2].draft).toBeUndefined();
});

it('keeps shuffle order through backup, sync and resume, and restores source order for an unshuffled reattempt', () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(0);
  const original = bank(10);
  const test = startExam(
    createExamSet(source, original.questions, 1)[0],
    20,
    { shuffleQuestions: true, shuffleOptions: true },
    original,
  );
  const state = upgradeState(emptyState());
  state.monty!.tests[test.id] = test;
  const restored = stateSchema.parse(JSON.parse(JSON.stringify(state)));
  const merged = mergeCloudState(state, restored, state);
  random.mockClear();
  expect(examQuestions(merged.monty!.tests[test.id], original)).toEqual(
    examQuestions(test, original),
  );
  expect(random).not.toHaveBeenCalled();
  const completed = finishExam(test, original);
  const retry = startExam(completed, 15, defaultQuizCustomization, original);
  expect(retry.draft!.questionOrder).toEqual(test.questionIds);
  expect(retry.latest).toEqual(completed.latest);
  expect(examQuestions(retry, original, true).map((q) => q.id)).toEqual(
    completed.latest!.questionOrder,
  );
});

it('keeps vocabulary shuffling stable and grades option identities after serialization', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const test = startAttempt(createTest(vocabulary(8), 'Vocab', 'pdf', [], 0), 9, {
    shuffleQuestions: true,
    shuffleOptions: true,
  });
  const state = upgradeState(emptyState());
  state.tests = [test];
  const restored = stateSchema.parse(JSON.parse(JSON.stringify(state))).tests[0];
  expect(presentQuestions(restored.questions, restored.draft)).toEqual(
    presentQuestions(test.questions, test.draft),
  );
  restored.draft!.answers = Object.fromEntries(
    restored.questions.map((q) => [q.id, Object.fromEntries(q.options.map((o) => [o.id, o.kind]))]),
  );
  const completed = finishAttempt(restored);
  expect(completed.latest!.score).toBe(8);
  const retry = startAttempt(completed, 15, defaultQuizCustomization);
  expect(presentQuestions(retry.questions, retry.draft)).toEqual(test.questions);
  expect(retry.latest!.optionOrder).toEqual(test.draft!.optionOrder);
});

it('supports exact-size groups and a smaller final quiz without dropping questions', () => {
  expect(quizSplitSizes(60, 1, 15)).toEqual([15, 15, 15, 15]);
  expect(quizSplitSizes(62, 1, 15)).toEqual([15, 15, 15, 15, 2]);
  expect(quizSplitSizes(60, 4)).toEqual([15, 15, 15, 15]);
});

it('keeps legacy attempts without order metadata readable and does not alter source options', () => {
  const original = bank(4);
  const started = startExam(createExamSet(source, original.questions, 1)[0]);
  delete started.draft!.questionOrder;
  delete started.draft!.optionOrder;
  expect(examQuestions(started, original)).toEqual(original.questions);
});
