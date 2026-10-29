import { it, expect } from 'vitest';
import { emptyState } from '../shared/types';
import { upgradeState } from '../shared/migrate';
import { DEFAULT_VOCAB } from '../shared/monty';
import { blankEntry } from '../src/core/vocabulary';
import { createTest, startAttempt } from '../src/core/quiz';
import { advanceClock, mathsTests, startExam, finishExam } from '../src/core/exams';
import { mergeCloudState } from '../src/storage/merge';
import { scopeState } from '../src/storage/scoped';
import type { Bank } from '../shared/monty';
it('flattens existing nested topic folders without changing content, IDs, bookmarks or attempts', () => {
  const state = upgradeState(emptyState());
  const original = state.monty!.folders[DEFAULT_VOCAB];
  state.monty!.folders.child = { ...original, id: 'child', name: 'Basic', parentId: original.id };
  state.monty!.folders.deep = { ...original, id: 'deep', name: 'Basic', parentId: 'child' };
  const entry = {
    ...blankEntry('Calm'),
    synonyms: [{ term: 'Serene', explanation: '' }],
    antonyms: [{ term: 'Agitated', explanation: '' }],
  };
  state.entries[entry.id] = entry;
  state.documents.push({
    id: 'nested-pdf',
    folderId: 'deep',
    name: 'Keep PDF',
    hash: 'hash',
    createdAt: 1,
    entryIds: [entry.id],
    status: 'ready',
    pendingPages: [],
  });
  state.tests.push({
    ...startAttempt(createTest([entry], 'Keep attempt', 'pdf', [], 0)),
    folderId: 'deep',
  });
  state.monty!.bookmarks.deep = [entry.id];
  const before = structuredClone(state);
  const next = upgradeState(state);
  expect(Object.keys(next.monty!.folders)).toEqual(Object.keys(before.monty!.folders));
  expect(Object.values(next.monty!.folders).every((f) => f.parentId === null)).toBe(true);
  const expected = structuredClone(before);
  Object.values(expected.monty!.folders).forEach((f) => (f.parentId = null));
  expect(next).toEqual(expected);
  expect(state).toEqual(before);
  expect(upgradeState(next)).toBe(next);
  const merged = mergeCloudState(before, next, before);
  expect(merged).toEqual(next);
});
it('migrates legacy results, bookmarks and an unfinished attempt once without replacing IDs or answers', () => {
  const old = emptyState(),
    e = {
      ...blankEntry('Calm'),
      meaningEn: 'peaceful',
      synonyms: [{ term: 'Serene', explanation: '' }],
      antonyms: [{ term: 'Agitated', explanation: '' }],
    };
  old.entries[e.id] = e;
  old.bookmarks = [e.id];
  old.documents = [
    {
      id: 'pdf',
      name: 'Old PDF',
      hash: 'hash',
      createdAt: 1,
      entryIds: [e.id],
      status: 'ready',
      pendingPages: [],
    },
  ];
  const t = startAttempt(createTest([e], 'Keep me', 'pdf', [], 0));
  t.draft!.clock = undefined;
  t.draft!.id = undefined;
  t.draft!.answers = { [t.questions[0].id]: { [t.questions[0].options[0].id]: 'syn' } };
  old.tests = [t];
  const next = upgradeState(old);
  expect(next.version).toBe(2);
  expect(next.documents[0].id).toBe('pdf');
  expect(next.tests[0].questions).toEqual(t.questions);
  expect(next.tests[0].draft?.answers).toEqual(t.draft!.answers);
  expect(next.tests[0].draft?.clock?.remainingMs).toBe(900000);
  expect(next.monty!.bookmarks[DEFAULT_VOCAB]).toEqual([e.id]);
  expect(upgradeState(next)).toEqual(next);
  expect(old.version).toBe(1);
});
it('keeps source-order groups and a smaller remainder without duplicate questions', () => {
  const bank = {
    version: 1,
    id: 'bank',
    kind: 'maths',
    questions: Array.from({ length: 63 }, (_, i) => ({ id: 'q' + i, number: i + 1 })),
    study: [],
    warnings: [],
  } as Bank;
  const tests = mathsTests(bank, 'folder', 'pdf', 'Source');
  expect(tests.map((t) => t.questionIds.length)).toEqual([25, 25, 13]);
  expect(tests[0].questionIds[0]).toBe('q0');
  expect(tests[2].questionIds.at(-1)).toBe('q62');
  expect(new Set(tests.flatMap((t) => t.questionIds)).size).toBe(63);
});
it('accumulates revisited question time, clamps expiry and separates unanswered items', () => {
  const bank = {
    version: 1,
    id: 'bank',
    kind: 'maths',
    questions: [
      { id: 'q1', number: 1, answerId: 'A' },
      { id: 'q2', number: 2, answerId: 'B' },
    ],
    study: [],
    warnings: [],
  } as Bank;
  let t = startExam(mathsTests(bank, 'f', 'pdf', 'PDF')[0]);
  let c = t.draft!.clock;
  c = advanceClock(c, 'q1', 6000);
  c = advanceClock(c, 'q2', 4000);
  c = advanceClock(c, 'q1', 3000);
  expect(c.spent).toEqual({ q1: 9000, q2: 4000 });
  expect(c.remainingMs).toBe(887000);
  c = advanceClock(c, 'q2', 900000);
  expect(c.remainingMs).toBe(0);
  t.draft!.clock = c;
  t.draft!.answers = { q1: 'A' };
  t = finishExam(t, bank);
  expect(t.latest).toMatchObject({ correct: 1, wrong: 0, unanswered: 1, elapsedMs: 900000 });
  expect(Object.values(t.latest!.spent).reduce((a, b) => a + b, 0)).toBe(900000);
});
it('merges new folders and separate bookmark collections without leaking folder contents', () => {
  const base = upgradeState(emptyState()),
    l = structuredClone(base),
    r = structuredClone(base);
  l.monty!.folders.a = {
    id: 'a',
    parentId: null,
    area: 'grammar',
    name: 'Grammar',
    profile: 'auto',
    pinned: false,
    createdAt: 1,
  };
  r.monty!.folders.b = {
    id: 'b',
    parentId: null,
    area: 'maths',
    name: 'Maths',
    profile: 'maths',
    pinned: false,
    createdAt: 2,
  };
  l.monty!.mathPracticeBookmarks.b = ['practice'];
  r.monty!.mathTestBookmarks.b = ['test'];
  const next = mergeCloudState(base, l, r);
  expect(next.monty!.folders.a.name).toBe('Grammar');
  expect(next.monty!.folders.b.name).toBe('Maths');
  expect(next.monty!.mathPracticeBookmarks.b).toEqual(['practice']);
  expect(next.monty!.mathTestBookmarks.b).toEqual(['test']);
  expect(scopeState(next, 'a').tests).toEqual([]);
});
it('does not resurrect a deleted folder’s attachments or bookmarks from another tab', () => {
  const base = upgradeState(emptyState()),
    folder = base.monty!.folders['maths-percentage'];
  base.monty!.attachments.note = {
    id: 'note',
    folderId: folder.id,
    name: 'Note',
    mime: 'text/plain',
    size: 1,
    pinned: false,
    kind: 'note',
    createdAt: 1,
    count: 0,
    status: 'saved',
  };
  const l = structuredClone(base),
    r = structuredClone(base);
  delete l.monty!.folders[folder.id];
  delete l.monty!.attachments.note;
  r.monty!.mathPracticeBookmarks[folder.id] = ['a|q|b'];
  const merged = mergeCloudState(base, l, r);
  expect(merged.monty!.folders[folder.id]).toBeUndefined();
  expect(merged.monty!.attachments.note).toBeUndefined();
  expect(merged.monty!.mathPracticeBookmarks[folder.id]).toBeUndefined();
});
