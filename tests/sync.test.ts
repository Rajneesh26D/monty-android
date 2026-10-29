import { it, expect } from 'vitest';
import { emptyState } from '../shared/types';
import { blankEntry } from '../src/core/vocabulary';
import { mergeCloudState } from '../src/storage/merge';
import { createTest, startAttempt, finishAttempt } from '../src/core/quiz';
function initial() {
  const s = emptyState();
  for (const word of ['Calm', 'Quiet', 'Still']) {
    const e = {
      ...blankEntry(word),
      meaningEn: 'peaceful',
      synonyms: [{ term: 'Serene', explanation: '' }],
      antonyms: [{ term: 'Agitated', explanation: '' }],
    };
    s.entries[e.id] = e;
  }
  return s;
}
it('combines independent phone bookmarks, remote results and settings without resetting either', () => {
  const base = initial(),
    local = structuredClone(base),
    remote = structuredClone(base),
    ids = Object.keys(base.entries);
  local.bookmarks = [ids[0]];
  remote.bookmarks = [ids[1]];
  remote.settings.hideReviewAnswers = true;
  remote.tests = [createTest(Object.values(remote.entries), 'Remote result', 'pdf', [], 1)];
  const next = mergeCloudState(base, local, remote);
  expect(new Set(next.bookmarks)).toEqual(new Set(ids.slice(0, 2)));
  expect(next.tests).toHaveLength(1);
  expect(next.settings.hideReviewAnswers).toBe(true);
});
it('does not resurrect a removed bookmark or permanently deleted test from a stale device', () => {
  const base = initial(),
    id = Object.keys(base.entries)[0];
  base.bookmarks = [id];
  base.tests = [createTest(Object.values(base.entries), 'Delete me', 'pdf', [], 1)];
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.tests = [];
  remote.bookmarks = [];
  const next = mergeCloudState(base, local, remote);
  expect(next.tests).toEqual([]);
  expect(next.bookmarks).toEqual([]);
});
it('recovers legacy conflict metadata without throwing away either library', () => {
  const local = initial(),
    remote = initial();
  local.bookmarks = [Object.keys(local.entries)[0]];
  remote.tests = [createTest(Object.values(remote.entries), 'Keep me', 'pdf', [], 1)];
  const next = mergeCloudState(undefined, local, remote);
  expect(Object.keys(next.entries)).toHaveLength(6);
  expect(next.tests).toHaveLength(1);
  expect(next.bookmarks).toEqual(local.bookmarks);
});
it('keeps the newest completed result and never revives its stale unfinished draft', () => {
  const base = initial();
  base.tests = [startAttempt(createTest(Object.values(base.entries), 'Test', 'pdf', [], 1))];
  const local = structuredClone(base),
    remote = structuredClone(base);
  const t = remote.tests[0];
  t.draft!.startedAt = 1;
  for (const q of t.questions)
    t.draft!.answers[q.id] = Object.fromEntries(q.options.map((o) => [o.id, o.kind]));
  remote.tests[0] = finishAttempt(t);
  const next = mergeCloudState(base, local, remote);
  expect(next.tests[0].latest?.score).toBe(1);
  expect(next.tests[0].draft).toBeUndefined();
});
it('merges classifications of different options in the same unfinished attempt', () => {
  const base = initial();
  base.tests = [startAttempt(createTest(Object.values(base.entries), 'Test', 'pdf', [], 1))];
  const local = structuredClone(base),
    remote = structuredClone(base),
    q = base.tests[0].questions[0];
  local.tests[0].draft!.answers[q.id] = { [q.options[0].id]: 'syn' };
  remote.tests[0].draft!.answers[q.id] = { [q.options[1].id]: 'ant' };
  const next = mergeCloudState(base, local, remote);
  expect(next.tests[0].draft!.answers[q.id]).toEqual({
    ...local.tests[0].draft!.answers[q.id],
    ...remote.tests[0].draft!.answers[q.id],
  });
});
