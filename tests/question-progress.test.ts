import { it, expect } from 'vitest';
import type { MCQ } from '../shared/monty';
import { resumePractice, questionProgress } from '../src/core/questionProgress';
import { flowMathText } from '../src/core/mathsText';
import { emptyState } from '../shared/types';
import { upgradeState } from '../shared/migrate';
import { startExam } from '../src/core/exams';
import { stateSchema } from '../shared/state-schema';
import { mergeCloudState } from '../src/storage/merge';

const questions = Array.from({ length: 50 }, (_, i) => ({
  id: `q${i + 1}`,
  options: [{ id: 'A' }, { id: 'B' }],
})) as MCQ[];
it('resumes at question 31 after 30 answers and ignores viewed-only questions', () => {
  const answers = Object.fromEntries(questions.slice(0, 30).map((q) => [q.id, 'A']));
  expect(resumePractice(questions, answers, 40)).toBe(30);
  const progress = questionProgress(
    questions.map((q) => q.id),
    (id) => !!answers[id],
    ['q40'],
    [],
    'q31',
  );
  expect(progress.filter((q) => q.answered)).toHaveLength(30);
  expect(progress[39].visited).toBe(true);
  expect(progress[39].answered).toBe(false);
  delete answers.q5;
  expect(resumePractice(questions, answers, 40)).toBe(4);
  answers.q5 = 'removed-option';
  expect(resumePractice(questions, answers)).toBe(4);
});
it('keeps completed choices reviewable without ever navigating beyond the question bank', () => {
  const answers = Object.fromEntries(questions.map((q) => [q.id, 'A']));
  expect(resumePractice(questions, answers, 100)).toBe(49);
});
it('tracks review independently from answered, visited and current states', () => {
  expect(questionProgress(['a', 'b', 'c'], (id) => id === 'a', [], ['a'], 'b')).toEqual([
    { id: 'a', answered: true, visited: true, marked: true },
    { id: 'b', answered: false, visited: true, marked: false },
    { id: 'c', answered: false, visited: false, marked: false },
  ]);
});
it('persists quiz flags through validation and concurrent phone saves, including unmarking', () => {
  const base = upgradeState(emptyState());
  const exam = startExam({
    id: 'test',
    folderId: 'maths-percentage',
    attachmentId: 'file',
    bankId: 'bank',
    name: 'Test',
    source: 'pdf',
    createdAt: 1,
    questionIds: ['a', 'b', 'c'],
  });
  exam.draft!.marked = ['a'];
  base.monty!.tests.test = exam;
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.monty!.tests.test.draft!.visited = ['a', 'b'];
  local.monty!.tests.test.draft!.marked = ['b'];
  remote.monty!.tests.test.draft!.visited = ['a', 'c'];
  remote.monty!.tests.test.draft!.marked = ['a', 'c'];
  const merged = stateSchema.parse(mergeCloudState(base, local, remote));
  expect(merged.monty!.tests.test.draft!.visited).toEqual(['a', 'b', 'c']);
  expect(merged.monty!.tests.test.draft!.marked).toEqual(['b', 'c']);
  expect(stateSchema.parse(base).monty!.tests.test.draft!.marked).toEqual(['a']);
});
it('rejoins the election question from the screenshot without changing the source', () => {
  const source =
    'In an election, candidate A got 45% of the votes\nand\ncandidate B got 30%. What percentage of votes\ndid\nothers get?\n[SSC CPO Pre 2025 12 Dec, 2025 S1]';
  expect(flowMathText(source)).toBe(
    'In an election, candidate A got 45% of the votes and candidate B got 30%. What percentage of votes did others get?\n[SSC CPO Pre 2025 12 Dec, 2025 S1]',
  );
  expect(
    flowMathText('Which is correct?\n(1) [[frac:1/8]] = 12.5%\n(2) 3² = 9\n\nChoose one.'),
  ).toBe('Which is correct?\n(1) [[frac:1/8]] = 12.5%\n(2) 3² = 9\n\nChoose one.');
});
