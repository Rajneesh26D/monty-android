import type { MCQ } from '../../shared/monty';

export function resumePractice(
  questions: MCQ[],
  answers: Record<string, string>,
  previousIndex = 0,
) {
  const next = questions.findIndex((q) => !q.options.some((o) => o.id === answers[q.id]));
  return next < 0 ? Math.max(0, Math.min(previousIndex, questions.length - 1)) : next;
}

export function questionProgress(
  ids: string[],
  answered: (id: string) => boolean,
  visited: string[] = [],
  marked: string[] = [],
  current = '',
) {
  return ids.map((id) => ({
    id,
    answered: answered(id),
    visited: id === current || visited.includes(id) || answered(id) || marked.includes(id),
    marked: marked.includes(id),
  }));
}
