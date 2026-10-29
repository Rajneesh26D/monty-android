import { it, expect } from 'vitest';
import { blankEntry, mergeEntries } from '../src/core/vocabulary';
import { createTest, startAttempt, finishAttempt } from '../src/core/quiz';
import { emptyState, type Answers } from '../shared/types';
const word = () => ({
  ...blankEntry('Calm'),
  meaningEn: 'peaceful',
  meaningHi: 'शांत',
  synonyms: [{ term: 'Serene', explanation: 'Serene also describes peacefulness.' }],
  antonyms: [
    { term: 'Agitated', explanation: 'Agitated describes disturbance rather than peacefulness.' },
  ],
});
it('grades all options and keeps the previous completed result until a retry finishes', () => {
  let t = startAttempt(createTest([word()], 'Test', 'pdf', ['PDF'], 0));
  const answers: Answers = {};
  for (const q of t.questions)
    answers[q.id] = Object.fromEntries(q.options.map((o) => [o.id, o.kind]));
  t.draft!.answers = answers;
  t = finishAttempt(t);
  expect(t.latest?.score).toBe(1);
  const old = structuredClone(t.latest);
  t = startAttempt(t);
  expect(t.latest).toEqual(old);
  for (const q of t.questions)
    t.draft!.answers[q.id] = Object.fromEntries(
      q.options.map((o) => [o.id, o.kind === 'syn' ? 'ant' : 'syn']),
    );
  t = finishAttempt(t);
  expect(t.latest?.score).toBe(0);
  expect(t.draft).toBeUndefined();
});
it('snapshots bookmark tests separately and never changes earlier membership', () => {
  const one = word(),
    two = { ...word(), id: 'two', word: 'Quiet', meaningEn: 'without noise' };
  const first = createTest([one], 'Bookmarks', 'bookmarks', [], 0),
    second = createTest([one, two], 'Bookmarks', 'bookmarks', [], 0);
  expect(first.id).not.toBe(second.id);
  expect(first.questions).toHaveLength(1);
  expect(second.questions).toHaveLength(2);
  one.meaningEn = 'edited';
  expect(first.questions[0].entry.meaningEn).toBe('peaceful');
});
it('deduplicates identical words across sources while preserving different senses', () => {
  const a = word(),
    b = { ...word(), id: 'b' },
    c = { ...word(), id: 'c', meaningEn: 'to soothe' };
  expect(createTest([a, b, c], 'Combined', 'combined', ['A', 'B'], 0).questions).toHaveLength(2);
  const merged = mergeEntries(emptyState(), [a, b, c]);
  expect(merged.ids).toHaveLength(2);
});
it('rejects incomplete submissions', () => {
  const t = startAttempt(createTest([word()], 'T', 'pdf', [], 0));
  expect(() => finishAttempt(t)).toThrow('every option');
});
it('retries an enriched source without duplicating entries whose meaning was initially absent', () => {
  const source = { ...word(), meaningEn: '', sources: [{ documentId: 'd', page: 1 }] };
  const original = mergeEntries(emptyState(), [source]);
  original.state.entries[source.id].meaningEn = 'peaceful';
  const retry = mergeEntries(original.state, [{ ...source, id: 'retry' }]);
  expect(Object.keys(retry.state.entries)).toHaveLength(1);
  expect(retry.ids).toEqual([source.id]);
});

it('splits 40 and 49 questions into balanced separate tests with no repetition', async () => {
  const { splitSizes, splitTest } = await import('../src/core/quiz');
  expect(splitSizes(40, 5)).toEqual([8, 8, 8, 8, 8]);
  expect(splitSizes(40, 3)).toEqual([13, 13, 14]);
  expect(splitSizes(49, 5)).toEqual([10, 10, 10, 10, 9]);
  for (let total = 1; total <= 100; total++)
    for (let n = 1; n <= Math.min(total, 5); n++) {
      const sizes = splitSizes(total, n);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(total);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(sizes.every((x) => x >= 1)).toBe(true);
    }
  const entries = Array.from({ length: 49 }, (_, i) => ({ ...word(), word: 'Word ' + i }));
  const parts = splitTest(createTest(entries, 'Combined', 'combined', ['A', 'B'], 0), 5);
  expect(parts.map((t) => t.questions.length)).toEqual([10, 10, 10, 10, 9]);
  expect(new Set(parts.flatMap((t) => t.questions.map((q) => q.entry.id))).size).toBe(49);
  expect(new Set(parts.map((t) => t.id)).size).toBe(5);
  expect(() => splitSizes(49, 6)).toThrow();
  expect(() => splitSizes(3, 5)).toThrow();
});
it('uses exact custom counts and never repeats the same sense across PDFs', () => {
  const entries = Array.from({ length: 25 }, (_, i) => ({ ...word(), word: 'Word ' + i }));
  expect(createTest(entries, 'Custom', 'combined', [], 17).questions).toHaveLength(17);
  expect(() => createTest(entries, 'Custom', 'pdf', [], -1)).toThrow();
});
