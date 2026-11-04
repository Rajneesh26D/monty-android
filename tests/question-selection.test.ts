import { it, expect, vi, afterEach } from 'vitest';
import { parseQuestionSelection, formatQuestionSelection } from '../shared/question-selection';
import { createWorker } from '../server/app';
import { memoryBucket } from './helpers/memory-bucket';
import { emptyState } from '../shared/types';
import { upgradeState } from '../shared/migrate';
import { stateSchema } from '../shared/state-schema';
import { createTest } from '../src/core/quiz';
import { blankEntry } from '../src/core/vocabulary';
afterEach(() => vi.unstubAllGlobals());
it.each([
  ['1,2,5,6 to 20', [1, 2, 5, ...Array.from({ length: 15 }, (_, i) => i + 6)]],
  ['1 to 20', Array.from({ length: 20 }, (_, i) => i + 1)],
  [
    '1 to 10, 15 to 20',
    [
      ...Array.from({ length: 10 }, (_, i) => i + 1),
      ...Array.from({ length: 6 }, (_, i) => i + 15),
    ],
  ],
  ['10,12,13 to 30', [10, 12, ...Array.from({ length: 18 }, (_, i) => i + 13)]],
  ['10-12, 12, 30', [10, 11, 12, 30]],
  ['30,2,1', [1, 2, 30]],
  ['Questions 10 through 12 and 20', [10, 11, 12, 20]],
] as [string, number[]][])('interprets %s exactly', (input, expected) => {
  expect(parseQuestionSelection(input, 60)).toEqual(expected);
  expect(parseQuestionSelection(formatQuestionSelection(expected), 60)).toEqual(expected);
});
it.each(['', '0', '1 to 61', '30 to 10', '1.5', 'some questions', '1 to', '3/5'])(
  'rejects invalid or ambiguous selection %s',
  (text) => expect(() => parseQuestionSelection(text, 60)).toThrow(),
);
it('saves chosen questions and timer without an active attempt and retains metadata through sync validation', () => {
  const entries = Array.from({ length: 60 }, (_, i) => ({
    ...blankEntry('Word ' + (i + 1)),
    meaningEn: 'Meaning',
    synonyms: [{ term: 'similar', explanation: '' }],
    antonyms: [{ term: 'opposite', explanation: '' }],
  }));
  const numbers = parseQuestionSelection('10 to 30', 60);
  const test = {
    ...createTest(
      numbers.map((n) => entries[n - 1]),
      'Selection',
      'pdf',
      [],
      0,
    ),
    selectionNumbers: numbers,
    durationMinutes: 25,
  };
  expect(test.draft).toBeUndefined();
  expect(test.questions).toHaveLength(21);
  expect(test.questions[0].entry.word).toBe('Word 10');
  const state = upgradeState(emptyState());
  state.tests = [test];
  expect(stateSchema.parse(JSON.parse(JSON.stringify(state))).tests[0]).toMatchObject({
    selectionNumbers: numbers,
    durationMinutes: 25,
  });
});
it('interprets standard ranges server-side without AI credentials', async () => {
  const r = await createWorker({}).fetch(
    new Request('https://example.com/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'question-selection', text: '1,2,5,6 to 20', total: 60 }),
    }),
    { BUCKET: memoryBucket() } as any,
  );
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ selection: '1–2, 5–20' });
});
it('validates AI output before returning it', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ selection: '1 to 99' }) } }],
        }),
        { status: 200 },
      ),
    ),
  );
  const r = await createWorker({}).fetch(
    new Request('https://example.com/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'question-selection', text: 'first twenty please', total: 60 }),
    }),
    { BUCKET: memoryBucket(), INFERX_API_KEY: 'test' } as any,
  );
  expect(r.status).toBe(400);
});

it('retains explicitly selected positions even when their vocabulary text repeats', () => {
  const word = {
    ...blankEntry('Repeat'),
    meaningEn: 'Same meaning',
    synonyms: [{ term: 'same', explanation: '' }],
    antonyms: [{ term: 'different', explanation: '' }],
  };
  const test = createTest(
    [word, { ...word, id: 'other-position' }],
    'Selection',
    'pdf',
    [],
    0,
    { shuffleQuestions: false, shuffleOptions: false },
    true,
  );
  expect(test.questions).toHaveLength(2);
  expect(test.draft).toBeUndefined();
});
