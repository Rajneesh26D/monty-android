import { expect, it } from 'vitest';
import { clockSchema, freshClock, type Bank } from '../shared/monty';
import { stateSchema } from '../shared/state-schema';
import { emptyState } from '../shared/types';
import { upgradeState } from '../shared/migrate';
import { blankEntry } from '../src/core/vocabulary';
import { advanceClock, finishExam, mathsTests, startExam } from '../src/core/exams';
import { createTest, finishAttempt, startAttempt } from '../src/core/quiz';
import { mergeCloudState } from '../src/storage/merge';

const bank = {
  id: 'bank',
  version: 1,
  kind: 'maths',
  study: [],
  warnings: [],
  questions: [{ id: 'q1', number: 1, answerId: 'a' }],
} as Bank;
const vocabulary = () =>
  createTest(
    [
      {
        ...blankEntry('Calm'),
        meaningEn: 'peaceful',
        synonyms: [{ term: 'Serene', explanation: '' }],
        antonyms: [{ term: 'Agitated', explanation: '' }],
      },
    ],
    'Vocabulary',
    'pdf',
    [],
    1,
  );

it('defaults new tests and reattempts to 15 minutes in both quiz engines', () => {
  const exam = mathsTests(bank, 'maths-percentage', 'pdf', 'Source')[0];
  expect(startExam(exam).draft!.clock.remainingMs).toBe(900000);
  expect(startAttempt(vocabulary()).draft!.clock!.remainingMs).toBe(900000);
  const custom = startExam(exam, 45);
  expect(startExam(custom).draft!.clock.remainingMs).toBe(900000);
  expect(startAttempt(startAttempt(vocabulary(), 45)).draft!.clock!.remainingMs).toBe(900000);
});

it.each([1, 5, 22, 30, 90, 180])(
  'grades a %i-minute maths attempt using its selected duration',
  (minutes) => {
    const test = startExam(mathsTests(bank, 'maths-percentage', 'pdf', 'Source')[0], minutes);
    test.draft!.clock = advanceClock(test.draft!.clock, 'q1', 43000);
    expect(test.draft!.clock.durationMs).toBe(minutes * 60000);
    test.draft!.answers = { q1: 'a' };
    const result = finishExam(test, bank).latest!;
    expect(result.elapsedMs).toBe(43000);
    expect(result.correct).toBe(1);
    expect(result.spent.q1).toBe(43000);
  },
);

it('expires a custom vocabulary timer at zero, retains the result and allows a different reattempt timer', () => {
  let test = startAttempt(vocabulary(), 37);
  const question = test.questions[0];
  test.draft!.answers = {
    [question.id]: Object.fromEntries(question.options.map((o) => [o.id, o.kind])),
  };
  test.draft!.clock = advanceClock(test.draft!.clock!, question.id, 40 * 60000);
  expect(test.draft!.clock.remainingMs).toBe(0);
  test = finishAttempt(test, true);
  expect(test.latest!.elapsedMs).toBe(37 * 60000);
  expect(test.latest!.score).toBe(1);
  const result = test.latest;
  const retry = startAttempt(test, 7);
  expect(retry.latest).toEqual(result);
  expect(retry.draft!.clock!.remainingMs).toBe(7 * 60000);
  expect(retry.draft!.answers).toEqual({});
});

it('round-trips longer timers through backup/cloud validation and merges resumed clocks intact', () => {
  const base = upgradeState(emptyState());
  base.tests = [startAttempt(vocabulary(), 60)];
  const test = startExam(mathsTests(bank, 'maths-percentage', 'pdf', 'Source')[0], 120);
  base.monty!.tests[test.id] = test;
  const local = stateSchema.parse(JSON.parse(JSON.stringify(base)));
  local.tests[0].draft!.clock = {
    ...advanceClock(local.tests[0].draft!.clock!, 'q1', 12000),
    updatedAt: Date.now() + 1,
    paused: true,
  };
  const merged = mergeCloudState(base, local, base);
  expect(merged.tests[0].draft!.clock).toMatchObject({
    durationMs: 3600000,
    remainingMs: 3588000,
    paused: true,
  });
  expect(merged.monty!.tests[test.id].draft!.clock.durationMs).toBe(7200000);
});

it('keeps legacy saved attempts compatible and calculates their elapsed time', () => {
  const legacy = { remainingMs: 880000, paused: true, spent: { q1: 20000 }, updatedAt: 1 };
  expect(clockSchema.parse(legacy)).toEqual(legacy);
  const test = startExam(mathsTests(bank, 'maths-percentage', 'pdf', 'Source')[0]);
  test.draft!.clock = legacy;
  expect(finishExam(test, bank).latest!.elapsedMs).toBe(20000);
});

it.each([0, -1, 1.5, NaN, Infinity, 525601])('rejects invalid timer duration %s', (value) => {
  expect(() => freshClock(value)).toThrow('whole number');
});
