import type { Exam, Bank, AttemptClock, MCQ } from '../../shared/monty';
import { freshClock, DEFAULT_DURATION_MS } from '../../shared/monty';
import { uid } from '../../shared/types';
import { splitItems } from './quiz';

export function uniqueExamQuestions(questions: MCQ[]): MCQ[] {
  const seen = new Set<string>();
  return questions.filter((q) => {
    const key = (q.stem + '|' + q.passage + '|' + q.options.map((o) => o.text).join('|'))
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function createExamSet(
  source: Pick<Exam, 'folderId' | 'attachmentId' | 'bankId' | 'name' | 'source'>,
  questions: MCQ[],
  parts: number,
): Exam[] {
  return splitItems(questions, parts).map((group, i) => ({
    ...source,
    id: uid(),
    name: source.name + (parts > 1 ? ` · ${i + 1}/${parts}` : ''),
    questionIds: group.map((q) => q.id),
    createdAt: Date.now(),
  }));
}
export function mathsTests(
  bank: Bank,
  folderId: string,
  attachmentId: string,
  name: string,
): Exam[] {
  const q = [...bank.questions].sort((a, b) => a.number - b.number);
  return Array.from({ length: Math.ceil(q.length / 25) }, (_, i) => ({
    id: `${attachmentId}-test-${i + 1}`,
    folderId,
    attachmentId,
    bankId: bank.id,
    name: `Test ${i + 1} · ${q.slice(i * 25, i * 25 + 25)[0]?.number}–${q.slice(i * 25, i * 25 + 25).at(-1)?.number}`,
    questionIds: q.slice(i * 25, i * 25 + 25).map((x) => x.id),
    createdAt: Date.now(),
    source: 'pdf' as const,
  }));
}
export function startExam(test: Exam, minutes = 15): Exam {
  return {
    ...test,
    draft: {
      id: uid(),
      index: 0,
      answers: {},
      visited: test.questionIds.slice(0, 1),
      marked: [],
      clock: { ...freshClock(minutes), paused: false },
      startedAt: Date.now(),
    },
  };
}
export function finishExam(test: Exam, bank: Bank): Exam {
  if (!test.draft) throw new Error('No attempt is running.');
  const d = test.draft;
  let correct = 0,
    wrong = 0,
    unanswered = 0;
  for (const id of test.questionIds) {
    const q = bank.questions.find((q) => q.id === id);
    if (!d.answers[id]) unanswered++;
    else if (q?.answerId === d.answers[id]) correct++;
    else wrong++;
  }
  return {
    ...test,
    draft: undefined,
    latest: {
      completedAt: Date.now(),
      answers: { ...d.answers },
      correct,
      wrong,
      unanswered,
      total: test.questionIds.length,
      spent: d.clock.spent,
      elapsedMs: (d.clock.durationMs ?? DEFAULT_DURATION_MS) - d.clock.remainingMs,
    },
  };
}
export function advanceClock(
  clock: AttemptClock,
  questionId: string,
  elapsed: number,
): AttemptClock {
  const delta = Math.min(clock.remainingMs, Math.max(0, elapsed));
  return {
    ...clock,
    remainingMs: clock.remainingMs - delta,
    spent: { ...clock.spent, [questionId]: (clock.spent[questionId] ?? 0) + delta },
    updatedAt: Date.now(),
    paused: clock.paused,
  };
}
export const time = (ms: number) =>
  `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor((Math.max(0, ms) % 60000) / 1000)).padStart(2, '0')}`;
