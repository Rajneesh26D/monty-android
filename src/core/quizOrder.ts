import type { AttemptOrder, QuizCustomization } from '../../shared/quiz-customization';
import { defaultQuizCustomization } from '../../shared/quiz-customization';

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function applyOrder<T extends { id: string }>(items: T[], order?: string[]): T[] {
  if (!order) return [...items];
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...items].sort(
    (a, b) => (positions.get(a.id) ?? order.length) - (positions.get(b.id) ?? order.length),
  );
}
export function createAttemptOrder<T extends { id: string; options: { id: string }[] }>(
  questions: T[],
  customization: QuizCustomization = defaultQuizCustomization,
): AttemptOrder {
  return {
    questionOrder: (customization.shuffleQuestions ? shuffle(questions) : questions).map(
      (q) => q.id,
    ),
    optionOrder: Object.fromEntries(
      questions.map((q) => [
        q.id,
        (customization.shuffleOptions ? shuffle(q.options) : q.options).map((o) => o.id),
      ]),
    ),
  };
}
export function presentQuestions<T extends { id: string; options: { id: string }[] }>(
  questions: T[],
  order?: AttemptOrder,
): T[] {
  return applyOrder(questions, order?.questionOrder).map((q) => ({
    ...q,
    options: applyOrder(q.options, order?.optionOrder?.[q.id]),
  }));
}
