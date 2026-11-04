import { freshClock, DEFAULT_DURATION_MS } from '../../shared/monty';
import { type Answers, type Entry, type QuizTest, type Result, uid } from '../../shared/types';
import { canQuiz, normalize } from './vocabulary';
export { shuffle } from './quizOrder';
import { createAttemptOrder } from './quizOrder';
import { defaultQuizCustomization, type QuizCustomization } from '../../shared/quiz-customization';
export function quizPool(entries: Entry[]): Entry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = normalize(e.word) + ':' + normalize(e.meaningEn);
    if (!canQuiz(e) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function selectQuestions<T>(items: T[], count: number): T[] {
  if (!Number.isSafeInteger(count) || count < 0)
    throw new Error('Enter a whole number of questions.');
  return items.slice(0, count || items.length);
}
export function createTest(
  entries: Entry[],
  name: string,
  source: QuizTest['source'],
  sourceNames: string[],
  count: number,
  customization: QuizCustomization = defaultQuizCustomization,
  preserveEntries = false,
): QuizTest {
  const pool = preserveEntries ? entries.filter(canQuiz) : quizPool(entries);
  if (!Number.isInteger(count) || count < 0) throw new Error('Enter a whole number of questions.');
  if (!pool.length)
    throw new Error('No words with valid synonym and antonym options. Complete an import first.');
  return {
    id: uid(),
    name,
    createdAt: Date.now(),
    source,
    sourceNames,
    customization: {
      shuffleQuestions: customization.shuffleQuestions,
      shuffleOptions: customization.shuffleOptions,
    },
    questions: selectQuestions(pool, count).map((e) => ({
      id: uid(),
      entry: structuredClone(e),
      options: [
        ...e.synonyms.slice(0, 3).map((r) => ({
          id: uid(),
          term: r.term,
          explanation: r.explanation,
          kind: 'syn' as const,
        })),
        ...e.antonyms.slice(0, 3).map((r) => ({
          id: uid(),
          term: r.term,
          explanation: r.explanation,
          kind: 'ant' as const,
        })),
      ],
    })),
  };
}
export function validSplit(total: number, parts: number): boolean {
  return (
    Number.isSafeInteger(total) &&
    total > 0 &&
    Number.isSafeInteger(parts) &&
    parts >= 1 &&
    parts <= total
  );
}
export function splitSizes(total: number, parts: number): number[] {
  if (!validSplit(total, parts))
    throw new Error('Choose a whole number of quizzes, with at least one question in each.');
  const base = Math.floor(total / parts),
    extra = total % parts;
  return Array.from(
    { length: parts },
    (_, i) => base + (extra && (extra / parts >= 0.5 ? i < extra : i >= parts - extra) ? 1 : 0),
  );
}
export function validQuizSplit(total: number, parts: number, perQuiz?: number | null): boolean {
  return perQuiz == null
    ? validSplit(total, parts)
    : Number.isSafeInteger(total) &&
        total > 0 &&
        Number.isSafeInteger(perQuiz) &&
        perQuiz >= 1 &&
        perQuiz <= total;
}
export function quizSplitSizes(total: number, parts: number, perQuiz?: number | null): number[] {
  if (!validQuizSplit(total, parts, perQuiz))
    throw new Error('Choose valid quiz sizes with at least one question in each.');
  if (perQuiz == null) return splitSizes(total, parts);
  return Array.from({ length: Math.ceil(total / perQuiz) }, (_, i) =>
    Math.min(perQuiz, total - i * perQuiz),
  );
}
export function splitItems<T>(items: T[], parts: number, perQuiz?: number | null): T[][] {
  let offset = 0;
  return quizSplitSizes(items.length, parts, perQuiz).map((size) => {
    const group = items.slice(offset, offset + size);
    offset += size;
    return group;
  });
}
export function splitTest(test: QuizTest, parts: number, perQuiz?: number | null): QuizTest[] {
  const groups = splitItems(test.questions, parts, perQuiz);
  return groups.map((questions, i) => {
    return {
      ...test,
      id: uid(),
      name: groups.length > 1 ? `${test.name} · ${i + 1}/${groups.length}` : test.name,
      questions,
      latest: undefined,
      draft: undefined,
    };
  });
}
export function startAttempt(
  test: QuizTest,
  minutes = 15,
  customization: QuizCustomization = test.customization ?? defaultQuizCustomization,
): QuizTest {
  return {
    ...test,
    customization: {
      shuffleQuestions: customization.shuffleQuestions,
      shuffleOptions: customization.shuffleOptions,
    },
    draft: {
      id: uid(),
      ...createAttemptOrder(test.questions, customization),
      clock: { ...freshClock(minutes), paused: false },
      index: 0,
      answers: {},
      visited: [],
      marked: [],
      startedAt: Date.now(),
    },
  };
}
export const allSelected = (test: QuizTest, answers: Answers) =>
  test.questions.every((q) => q.options.every((o) => answers[q.id]?.[o.id]));
export function grade(test: QuizTest, answers: Answers, allowPartial = false): Result {
  if (!allowPartial && !allSelected(test, answers))
    throw new Error('Choose a classification for every option before finishing.');
  return {
    completedAt: Date.now(),
    questionOrder: test.draft?.questionOrder,
    optionOrder: test.draft?.optionOrder,
    score: test.questions.filter((q) => q.options.every((o) => answers[q.id]?.[o.id] === o.kind))
      .length,
    wrong: test.questions.filter(
      (q) =>
        Object.keys(answers[q.id] ?? {}).length > 0 &&
        !q.options.every((o) => answers[q.id]?.[o.id] === o.kind),
    ).length,
    unanswered: test.questions.filter((q) => !Object.keys(answers[q.id] ?? {}).length).length,
    spent: test.draft?.clock?.spent,
    elapsedMs: test.draft?.clock
      ? (test.draft.clock.durationMs ?? DEFAULT_DURATION_MS) - test.draft.clock.remainingMs
      : undefined,
    total: test.questions.length,
    answers: structuredClone(answers),
  };
}
export function finishAttempt(test: QuizTest, allowPartial = false): QuizTest {
  if (!test.draft) throw new Error('No active attempt.');
  return { ...test, latest: grade(test, test.draft.answers, allowPartial), draft: undefined };
}
