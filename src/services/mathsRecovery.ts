import type { Area, Bank, MCQ } from '../../shared/monty';
import type { MathsRequest, MathsOutput } from '../../shared/maths-extraction';
import { MATH_LAYOUT_VERSION, mathItems } from '../pdf/content';
import { linesOf, type PageData } from '../pdf/parser';
import { readingText } from '../pdf/readingText';
import { readJob, saveJob } from '../storage/repository';
import { extractMaths } from './api';
import type { openPdf } from '../pdf/reader';
import type { Progress } from './importer';
const reference = (q: { number: number; part?: string; sourcePart?: string }) =>
  `${q.number}-${q.part ?? q.sourcePart ?? ''}`;
export async function recoverMaths(
  bank: Bank,
  known: { number: number; part: string; answerId: string }[],
  sourceId: string,
  pdf: Awaited<ReturnType<typeof openPdf>>,
  progress: Progress,
  signal?: AbortSignal,
  options: {
    area?: Area;
    fragments?: {
      number: number;
      part: string;
      page: number;
      pages: number[];
      context: string;
      text: string;
    }[];
    onCheckpoint?: (bank: Bank) => Promise<void>;
  } = {},
): Promise<Bank> {
  const targets = new Set<number>();
  for (const warning of bank.warnings) {
    const q = warning.match(/^Question (\d+):/);
    if (q) targets.add(Number(q[1]));
    if (warning.startsWith('Could not locate questions:'))
      for (const n of warning.matchAll(/\d+/g)) targets.add(Number(n[0]));
  }
  if (!targets.size && bank.questions.length) return bank;
  const collected = new Map(bank.questions.map((q) => [q.id, q])),
    original = new Set(collected.keys());
  const errors: { numbers: number[]; message: string }[] = [];
  let uncertain = false,
    failures = 0;
  const complete = (n: number) => {
    const present = [...collected.values()].filter((q) => q.number === n),
      answers = known.filter((a) => a.number === n);
    return (
      present.length > 0 && answers.every((a) => present.some((q) => reference(q) === reference(a)))
    );
  };
  const snapshot = () => ({
    ...bank,
    questions: [...collected.values()].sort((a, b) => a.number - b.number),
  });
  const append = (result: MathsOutput) => {
    for (const q of result.questions) {
      const id = `${bank.id}-q${q.number}${q.part ? '-' + q.part : ''}`;
      if (original.has(id)) continue;
      collected.set(id, {
        id,
        number: q.number,
        ...(q.part ? { sourcePart: q.part } : {}),
        stem: q.part ? `(${q.part}) ${q.stem}` : q.stem,
        meaningHi: '',
        passage: q.passage || '',
        options: q.options.map((text, i) => ({
          id: String.fromCharCode(65 + i),
          label: String.fromCharCode(65 + i),
          text,
        })),
        answerId: q.answerId,
        page: q.page,
        pages: options.fragments?.find((f) => f.number === q.number && f.part === q.part)
          ?.pages ?? [q.page],
        origin: 'pdf',
        answerOrigin: q.answerOrigin,
        evidence: q.evidence,
        explanation: q.explanation,
      });
    }
  };
  if (bank.questions.length && options.onCheckpoint) await options.onCheckpoint(snapshot());
  const pageAt = async (n: number) =>
    (await readJob<PageData>(`page-${sourceId}-${n}`)) ?? (await pdf.page(n));
  for (let n = 1; n <= pdf.count; n++) {
    if (signal?.aborted) throw new Error('Import paused. Completed questions are saved.');
    const page = await pageAt(n);
    const pageTargets = [...targets].filter(
      (number) =>
        !complete(number) &&
        new RegExp(`(?:^|\\n|\\s)(?:Q(?:uestion)?[. :]*\\s*)?${number}[.):]`, 'i').test(page.text),
    );
    if (targets.size && !pageTargets.length) continue;
    if (
      !targets.size &&
      ((!page.text.trim() && !page.hasVisualContent) || /answer\s*key/i.test(page.text))
    )
      continue;
    const group: PageData[] = [];
    for (let k = Math.max(1, n - 1); k <= Math.min(pdf.count, n + 1); k++)
      group.push(k === n ? page : await pageAt(k));
    const pages = await Promise.all(
      group.map(async (p) => {
        const items = mathItems(p.items);
        return {
          number: p.number,
          text: readingText({ ...p, items, text: linesOf(items).join('\n') }).slice(0, 40000),
          ...(p.text.trim().length < 50 ? { image: await pdf.image(p.number) } : {}),
        };
      }),
    );
    for (let offset = 0; offset < Math.max(1, pageTargets.length); offset += 6) {
      const selected = pageTargets.slice(offset, offset + 6);
      const key = `question-recovery-v2-${MATH_LAYOUT_VERSION}-${sourceId}-${n}-${selected.join('-') || 'all'}`;
      let saved = await readJob<MathsOutput>(key);
      if (saved) append(saved);
      const pending = () => selected.filter((number) => !complete(number));
      for (let round = 0; round < 2; round++) {
        if (selected.length && !pending().length) break;
        if (!selected.length && saved && !saved.unresolved.length) break;
        const wanted = selected.length ? pending() : (saved?.unresolved ?? []);
        try {
          progress(
            `Recovering ${wanted.length ? wanted.length + ' missing questions' : 'source questions'} · page ${n} of ${pdf.count}`,
            55 + Math.round((n / pdf.count) * 40),
          );
          const previous = collected.size;
          const fragments = options.fragments?.filter((f) => wanted.includes(f.number));
          let selectedPages = pages;
          if (
            wanted.length &&
            fragments?.length &&
            wanted.every((number) => fragments.some((f) => f.number === number))
          ) {
            const ids = [...new Set(fragments.map((f) => f.page))];
            selectedPages = ids.map((number) => {
              const rows = fragments.filter((f) => f.page === number);
              return {
                number,
                text: [
                  ...[...new Set(rows.map((f) => f.context))].filter(Boolean),
                  ...rows.map((f) => f.text),
                ].join('\n\n'),
              };
            });
          }
          const result = await extractMaths(
            {
              area: options.area ?? 'maths',
              task: 'recover-questions',
              focusPage: n,
              targets: wanted,
              exclude: [...collected.values()]
                .filter((q) => !wanted.length || wanted.includes(q.number))
                .map((q) => ({ number: q.number, part: q.sourcePart || '' })),
              answers: known.filter(
                (a) =>
                  (!wanted.length || wanted.includes(a.number)) &&
                  ![...collected.values()].some((q) => reference(q) === reference(a)),
              ) as MathsRequest['answers'],
              pages: selectedPages,
            },
            signal,
          );
          append(result);
          if (result.unresolved.length && result.diagnostics?.length)
            errors.push({
              numbers: result.unresolved,
              message:
                'Recovery provider results: ' +
                result.diagnostics
                  .filter((d) => d.outcome !== 'success')
                  .map((d) => d.provider + ': ' + d.outcome)
                  .join('; '),
            });
          const stored = new Map((saved?.questions || []).map((q) => [reference(q), q]));
          for (const q of result.questions) stored.set(reference(q), q);
          saved = {
            ...result,
            questions: [...stored.values()],
            unresolved: selected.length ? pending() : result.unresolved,
          };
          await saveJob(key, saved);
          if (options.onCheckpoint && collected.size > previous)
            await options.onCheckpoint(snapshot());
          failures = 0;
          if (!selected.length) uncertain ||= result.unresolved.length > 0;
          if (collected.size === previous || !saved.unresolved.length) break;
        } catch (e) {
          if (signal?.aborted) throw e;
          errors.push({
            numbers: wanted,
            message: e instanceof Error ? e.message : 'Question recovery failed.',
          });
          failures++;
          break;
        }
      }
    }
    if (failures >= 2) break; // Persist pending work instead of hammering an exhausted free account.
  }
  const warnings = bank.warnings.filter((w) => {
    const q = w.match(/^Question (\d+):/);
    if (q) return !complete(Number(q[1]));
    return (
      !w.startsWith('Could not locate questions:') &&
      !w.startsWith('No readable numbered questions')
    );
  });
  const missing = [...targets].filter((n) => !complete(n));
  if (missing.length)
    warnings.push(
      `Questions waiting for recovery: ${missing.join(', ')}. Successfully extracted questions are available in this quiz.`,
    );
  if (uncertain)
    warnings.push('Some source questions are unresolved; completed recovery chunks are saved.');
  if (!collected.size)
    warnings.push('No reliable questions extracted yet. The original PDF is saved.');
  for (const e of errors)
    if (!e.numbers.length || e.numbers.some((n) => !complete(n))) warnings.push(e.message);
  return { ...snapshot(), warnings: [...new Set(warnings)] };
}
