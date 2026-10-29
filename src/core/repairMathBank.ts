import type { Bank } from '../../shared/monty';
import { MATH_LAYOUT_VERSION } from '../pdf/content';
const sameText = (a: string, b: string) =>
  a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

// Derive corrected text only when it still matches the previous PDF parser.
// Keep manual edits, IDs, answer keys and all attempt/progress references intact.
export function repairMathBank(current: Bank, previousSource: Bank, correctedSource: Bank): Bank {
  const previous = new Map(previousSource.questions.map((q) => [q.number, q]));
  const corrected = new Map(correctedSource.questions.map((q) => [q.number, q]));
  return {
    ...current,
    mathLayoutVersion: MATH_LAYOUT_VERSION,
    questions: current.questions.map((question) => {
      const before = previous.get(question.number),
        after = corrected.get(question.number);
      if (!before || !after) return question;
      return {
        ...question,
        stem: sameText(question.stem, before.stem) ? after.stem : question.stem,
        options: question.options.map((option) => {
          const old = before.options.find((o) => o.id === option.id),
            fresh = after.options.find((o) => o.id === option.id);
          return old && fresh && sameText(option.text, old.text)
            ? { ...option, text: fresh.text }
            : option;
        }),
      };
    }),
  };
}
