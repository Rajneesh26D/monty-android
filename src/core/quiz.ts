import { freshClock } from '../../shared/monty';
import { type Answers, type Entry, type QuizTest, type Result, uid } from '../../shared/types';
import { canQuiz, normalize } from './vocabulary';
export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function quizPool(entries: Entry[]): Entry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = normalize(e.word) + ':' + normalize(e.meaningEn);
    if (!canQuiz(e) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function createTest(
  entries: Entry[],
  name: string,
  source: QuizTest['source'],
  sourceNames: string[],
  count: number,
): QuizTest {
  const pool = quizPool(entries);
  if (!Number.isInteger(count) || count < 0) throw new Error('Enter a whole number of questions.');
  if (!pool.length)
    throw new Error('No words with valid synonym and antonym options. Complete an import first.');
  return {
    id: uid(),
    name,
    createdAt: Date.now(),
    source,
    sourceNames,
    questions: shuffle(pool)
      .slice(0, count || pool.length)
      .map((e) => ({
        id: uid(),
        entry: structuredClone(e),
        options: shuffle([
          ...shuffle(e.synonyms)
            .slice(0, 3)
            .map((r) => ({
              id: uid(),
              term: r.term,
              explanation: r.explanation,
              kind: 'syn' as const,
            })),
          ...shuffle(e.antonyms)
            .slice(0, 3)
            .map((r) => ({
              id: uid(),
              term: r.term,
              explanation: r.explanation,
              kind: 'ant' as const,
            })),
        ]),
      })),
  };
}
export function splitSizes(total: number, parts: number): number[] {
  if (
    !Number.isInteger(parts) ||
    parts < 1 ||
    parts > 5 ||
    !Number.isInteger(total) ||
    total < parts
  )
    throw new Error('Choose 1–5 tests, with at least one question in each.');
  const base = Math.floor(total / parts),
    extra = total % parts;
  return Array.from(
    { length: parts },
    (_, i) => base + (extra && (extra / parts >= 0.5 ? i < extra : i >= parts - extra) ? 1 : 0),
  );
}
export function splitTest(test: QuizTest, parts: number): QuizTest[] {
  const sizes = splitSizes(test.questions.length, parts);
  let offset = 0;
  return sizes.map((size, i) => {
    const questions = test.questions.slice(offset, offset + size);
    offset += size;
    return {
      ...test,
      id: uid(),
      name: `${test.name} · ${i + 1}/${parts}`,
      questions,
      latest: undefined,
      draft: undefined,
    };
  });
}
export function startAttempt(test: QuizTest): QuizTest {
  return {
    ...test,
    questions: shuffle(test.questions).map((q) => ({ ...q, options: shuffle(q.options) })),
    draft: {
      id: uid(),
      clock: { ...freshClock(), paused: false },
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
    score: test.questions.filter((q) => q.options.every((o) => answers[q.id]?.[o.id] === o.kind))
      .length,
    wrong: test.questions.filter(
      (q) =>
        Object.keys(answers[q.id] ?? {}).length > 0 &&
        !q.options.every((o) => answers[q.id]?.[o.id] === o.kind),
    ).length,
    unanswered: test.questions.filter((q) => !Object.keys(answers[q.id] ?? {}).length).length,
    spent: test.draft?.clock?.spent,
    elapsedMs: test.draft?.clock ? 900000 - test.draft.clock.remainingMs : undefined,
    total: test.questions.length,
    answers: structuredClone(answers),
  };
}
export function finishAttempt(test: QuizTest, allowPartial = false): QuizTest {
  if (!test.draft) throw new Error('No active attempt.');
  return { ...test, latest: grade(test, test.draft.answers, allowPartial), draft: undefined };
}
