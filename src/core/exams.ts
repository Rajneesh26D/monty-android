import type { Exam, Bank, AttemptClock, MCQ } from '../../shared/monty';
import { freshClock, DEFAULT_DURATION_MS } from '../../shared/monty';
import { uid } from '../../shared/types';
import { splitItems } from './quiz';
import { applyOrder, createAttemptOrder, presentQuestions } from './quizOrder';
import { defaultQuizCustomization, type QuizCustomization } from '../../shared/quiz-customization';

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
  perQuiz?: number | null,
  customization: QuizCustomization = defaultQuizCustomization,
): Exam[] {
  const groups = splitItems(questions, parts, perQuiz);
  return groups.map((group, i) => ({
    ...source,
    id: uid(),
    name: source.name + (groups.length > 1 ? ` · ${i + 1}/${groups.length}` : ''),
    customization: {
      shuffleQuestions: customization.shuffleQuestions,
      shuffleOptions: customization.shuffleOptions,
    },
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
export function examQuestions(test: Exam, bank: Bank, review = false): MCQ[] {
  const source = applyOrder(
    bank.questions.filter((q) => test.questionIds.includes(q.id)),
    test.questionIds,
  );
  const order = review ? test.latest : test.draft;
  return presentQuestions(source, order).map((q) => {
    const original = source.find((item) => item.id === q.id)!.options;
    const moved = q.options.some((option, index) => option.id !== original[index]?.id);
    return {
      ...q,
      options: moved
        ? q.options.map((option, index) => ({ ...option, label: String.fromCharCode(65 + index) }))
        : q.options,
    };
  });
}
export function startExam(
  test: Exam,
  minutes = 15,
  customization: QuizCustomization = test.customization ?? defaultQuizCustomization,
  bank?: Bank,
): Exam {
  if (customization.shuffleOptions && !bank)
    throw new Error('Load the question sheet before shuffling options.');
  const source: { id: string; options: { id: string }[] }[] = bank
    ? applyOrder(
        bank.questions.filter((q) => test.questionIds.includes(q.id)),
        test.questionIds,
      )
    : test.questionIds.map((id) => ({ id, options: [] }));
  const order = createAttemptOrder(source, customization);
  return {
    ...test,
    customization: {
      shuffleQuestions: customization.shuffleQuestions,
      shuffleOptions: customization.shuffleOptions,
    },
    draft: {
      id: uid(),
      ...order,
      index: 0,
      answers: {},
      visited: order.questionOrder?.slice(0, 1),
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
      questionOrder: d.questionOrder,
      optionOrder: d.optionOrder,
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
