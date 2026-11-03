import { questionProgress } from './questionProgress';
export const examStatuses = [
  ['answered', 'Answered'],
  ['not-answered', 'Not answered'],
  ['not-visited', 'Not visited'],
  ['review', 'Marked for review'],
  ['answered-review', 'Answered & marked for review'],
] as const;
export type ExamStatus = (typeof examStatuses)[number][0];
export function examPalette(
  ids: string[],
  answered: (id: string) => boolean,
  visited: string[] = [],
  marked: string[] = [],
  current = '',
) {
  const items = questionProgress(ids, answered, visited, marked, current).map((q) => ({
    ...q,
    status: (q.marked
      ? q.answered
        ? 'answered-review'
        : 'review'
      : q.answered
        ? 'answered'
        : q.visited
          ? 'not-answered'
          : 'not-visited') as ExamStatus,
  }));
  const counts = Object.fromEntries(
    examStatuses.map(([status]) => [status, items.filter((q) => q.status === status).length]),
  ) as Record<ExamStatus, number>;
  return { items, counts };
}
// Keep review flags, the destination and visited history in one saved transition.
export function navigateAttempt<T extends { index: number; visited?: string[]; marked?: string[] }>(
  draft: T,
  ids: string[],
  action: 'jump' | 'save-next' | 'review-next',
  destination?: number,
): T {
  const index = action === 'jump' ? destination! : Math.min(draft.index + 1, ids.length - 1);
  if (!ids[draft.index] || !Number.isInteger(index) || index < 0 || index >= ids.length)
    throw new Error('Invalid question navigation.');
  const current = ids[draft.index];
  const marked =
    action === 'review-next'
      ? [...new Set([...(draft.marked ?? []), current])]
      : action === 'save-next'
        ? (draft.marked ?? []).filter((id) => id !== current)
        : [...(draft.marked ?? [])];
  return {
    ...draft,
    index,
    visited: [...new Set([...(draft.visited ?? []), current, ids[index]])],
    marked,
  };
}
