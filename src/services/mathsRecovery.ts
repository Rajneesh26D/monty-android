import type { Bank, MCQ } from '../../shared/monty';
import type { MathsRequest, MathsOutput } from '../../shared/maths-extraction';
import { MATH_LAYOUT_VERSION, mathItems } from '../pdf/content';
import { linesOf, type PageData } from '../pdf/parser';
import { readingText } from '../pdf/readingText';
import { readJob, saveJob } from '../storage/repository';
import { extractMaths } from './api';
import type { openPdf } from '../pdf/reader';
import type { Progress } from './importer';
export async function recoverMaths(
  bank: Bank,
  known: { number: number; part: string; answerId: string }[],
  sourceId: string,
  pdf: Awaited<ReturnType<typeof openPdf>>,
  progress: Progress,
  signal?: AbortSignal,
): Promise<Bank> {
  const targets = new Set<number>();
  for (const warning of bank.warnings) {
    const question = warning.match(/^Question (\d+):/);
    if (question) targets.add(Number(question[1]));
    if (warning.startsWith('Could not locate questions:'))
      for (const n of warning.matchAll(/\d+/g)) targets.add(Number(n[0]));
  }
  const recovered = new Map<string, MCQ>();
  const resolved = new Set<number>();
  const errors: string[] = [];
  let incomplete = false;
  // Bounded page windows preserve continuations without sending a whole PDF.
  const pageAt = async (n: number) =>
    (await readJob<PageData>(`page-${sourceId}-${n}`)) ?? (await pdf.page(n));
  for (let n = 1; n <= pdf.count; n++) {
    if (signal?.aborted) throw new Error('Import paused. Completed chunks are saved.');
    const page = await pageAt(n);
    const selected = [...targets].filter(
      (number) =>
        !resolved.has(number) &&
        new RegExp(`(?:^|\\n|\\s)(?:Q(?:uestion)?[. :]*\\s*)?${number}[.):]`, 'i').test(page.text),
    );
    if (targets.size && !selected.length) continue;
    if (!targets.size && !page.text.trim() && !page.hasVisualContent) continue;
    if (!targets.size && /answer\s*key/i.test(page.text)) continue;
    const group: PageData[] = [];
    for (let k = Math.max(1, n - 1); k <= Math.min(pdf.count, n + 1); k++)
      group.push(k === n ? page : await pageAt(k));
    const key = `maths-recovery-${MATH_LAYOUT_VERSION}-${sourceId}-${n}-${selected.join('-') || 'all'}`;
    try {
      progress(`AI recovery · page ${n} of ${pdf.count}`, 55 + Math.round((n / pdf.count) * 40));
      let result = await readJob<MathsOutput>(key);
      if (!result) {
        result = await extractMaths(
          {
            area: 'maths',
            targets: selected,
            answers: known.filter(
              (a) => !selected.length || selected.includes(a.number),
            ) as MathsRequest['answers'],
            pages: await Promise.all(
              group.map(async (p) => {
                const items = mathItems(p.items);
                return {
                  number: p.number,
                  text: readingText({ ...p, items, text: linesOf(items).join('\n') }).slice(
                    0,
                    40000,
                  ),
                  ...(p.text.trim().length < 50 || p.text.includes('�')
                    ? { image: await pdf.image(p.number) }
                    : {}),
                };
              }),
            ),
          },
          signal,
        );
        if (!result.unresolved.length) await saveJob(key, result);
      }
      incomplete ||= result.unresolved.length > 0;
      for (const q of result.questions) {
        const id = `${bank.id}-q${q.number}${q.part ? '-' + q.part : ''}`;
        if (bank.questions.some((old) => old.id === id)) continue;
        recovered.set(id, {
          id,
          number: q.number,
          ...(q.part ? { sourcePart: q.part } : {}),
          stem: q.part ? `(${q.part}) ${q.stem}` : q.stem,
          meaningHi: '',
          passage: '',
          options: q.options.map((text, i) => ({
            id: String.fromCharCode(65 + i),
            label: String.fromCharCode(65 + i),
            text,
          })),
          answerId: q.answerId,
          page: q.page,
          pages: group.map((p) => p.number),
          origin: 'pdf',
          answerOrigin: q.answerOrigin,
          evidence: q.evidence,
          explanation: q.explanation,
        });
      }
      for (const number of selected) {
        const expected = known.filter((a) => a.number === number);
        if (
          !result.unresolved.includes(number) &&
          result.questions.some((q) => q.number === number) &&
          expected.every((a) =>
            result!.questions.some((q) => q.number === number && q.part === a.part),
          )
        )
          resolved.add(number);
      }
    } catch (e) {
      if (signal?.aborted) throw e;
      errors.push(e instanceof Error ? e.message : 'AI recovery failed.');
      break;
    }
  }
  const warnings = bank.warnings.filter((w) => {
    const q = w.match(/^Question (\d+):/);
    if (q) return !resolved.has(Number(q[1]));
    return (
      !w.startsWith('Could not locate questions:') &&
      !w.startsWith('No readable numbered questions')
    );
  });
  const missing = [...targets].filter((n) => !resolved.has(n));
  if (missing.length && !warnings.length)
    warnings.push(`Could not recover questions: ${missing.join(', ')}.`);
  if (incomplete)
    warnings.push('AI left unresolved questions. Completed chunks are saved; resume to retry.');
  if (!bank.questions.length && !recovered.size)
    warnings.push(
      'No reliable questions extracted. A scanned PDF needs OCR or a vision-capable provider.',
    );
  return {
    ...bank,
    questions: [...bank.questions, ...recovered.values()].sort((a, b) => a.number - b.number),
    warnings: [...new Set([...warnings, ...errors])],
  };
}
