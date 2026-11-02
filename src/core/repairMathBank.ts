import type { Bank } from '../../shared/monty';
import { MATH_LAYOUT_VERSION } from '../pdf/content';
const sameText = (a: string, b: string) =>
  a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

// Derive corrected text only when it still matches the previous PDF parser.
// Keep manual edits, IDs, answer keys and all attempt/progress references intact.
export function repairMathBank(current: Bank, previousSource: Bank, correctedSource: Bank): Bank {
  const ref = (q: Bank['questions'][number]) => `${q.number}-${q.sourcePart || ''}`;
  const previous = new Map(previousSource.questions.map((q) => [ref(q), q]));
  const corrected = new Map(correctedSource.questions.map((q) => [ref(q), q]));
  const existing = new Set(current.questions.map(ref));
  // Restore only questions the old parser itself omitted. A question deliberately
  // removed from an otherwise valid source bank must remain removed.
  const recovered = correctedSource.questions.filter(
    (q) => !existing.has(ref(q)) && !previous.has(ref(q)),
  );
  return {
    ...current,
    mathLayoutVersion: MATH_LAYOUT_VERSION,
    warnings: [
      ...new Set([
        ...current.warnings.filter((warning) => !previousSource.warnings.includes(warning)),
        ...correctedSource.warnings,
      ]),
    ],
    questions: [
      ...current.questions.map((question) => {
        const before = previous.get(ref(question)),
          after = corrected.get(ref(question));
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
      ...recovered,
    ].sort((a, b) => a.number - b.number),
  };
}
