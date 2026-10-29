import { MAX_UPLOAD_BYTES, UPLOAD_SIZE_ERROR } from '../../shared/uploads';
import type { State } from '../../shared/types';
import { uid } from '../../shared/types';
import type { Attachment, Bank, Area, Folder, MCQ, StudyItem } from '../../shared/monty';
import { bankSchema } from '../../shared/monty';
import { saveAttachment, readAttachment, saveJob, readJob } from '../storage/repository';
import { openPdf } from '../pdf/reader';
import { parsePages, type PageData } from '../pdf/parser';
import type { Entry } from '../../shared/types';
import { readingText } from '../pdf/readingText';
import { MathsParser, IdiomsParser } from '../pdf/content';
import { extractGeneral } from './api';
import type { Commit, Progress } from './importer';
import type { GeneralOutput } from '../../shared/general';
import { mathsTests } from '../core/exams';
const banks = new Map<string, Bank>();
export async function readBank(id: string) {
  if (banks.has(id)) return banks.get(id)!;
  const file = await readAttachment(id);
  const bank = bankSchema.parse(JSON.parse(new TextDecoder().decode(file.bytes)));
  banks.set(id, bank);
  return bank;
}
export async function saveBank(bank: Bank) {
  const data = bankSchema.parse(bank);
  await saveAttachment(bank.id, new TextEncoder().encode(JSON.stringify(data)), 'application/json');
  banks.set(bank.id, data);
}
export async function addNote(file: File, folderId: string, commit: Commit) {
  if (!file.size) throw new Error('This file is empty. Choose a file with content.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(UPLOAD_SIZE_ERROR);
  const id = uid();
  await saveAttachment(id, file, file.type || 'application/octet-stream');
  const note: Attachment = {
    id,
    folderId,
    name: file.name,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    pinned: false,
    kind: 'note',
    createdAt: Date.now(),
    count: 0,
    status: 'saved',
  };
  await commit((s) => ({
    ...s,
    monty: { ...s.monty!, attachments: { ...s.monty!.attachments, [id]: note } },
  }));
}
export async function addPractice(
  file: File,
  folder: Folder,
  current: () => State,
  commit: Commit,
  progress: Progress,
  signal?: AbortSignal,
) {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(UPLOAD_SIZE_ERROR);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes('%PDF-'))
    throw new Error('Choose a PDF file.');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  if (
    Object.values(current().monty!.attachments).some(
      (a) => a.kind === 'practice' && a.folderId === folder.id && a.hash === hash,
    )
  )
    throw new Error('This PDF is already in this folder. Use Resume import on its card.');
  const id = uid();
  await saveAttachment(id, bytes, 'application/pdf');
  const attachment: Attachment = {
    id,
    folderId: folder.id,
    name: file.name.replace(/\.pdf$/i, ''),
    mime: 'application/pdf',
    size: file.size,
    pinned: false,
    kind: 'practice',
    createdAt: Date.now(),
    hash,
    count: 0,
    status: 'reading',
  };
  await commit((s) => ({
    ...s,
    monty: { ...s.monty!, attachments: { ...s.monty!.attachments, [id]: attachment } },
  }));
  await importPractice(id, folder, current, commit, progress, signal);
}
const runningImports = new Set<string>();
export async function importPractice(
  id: string,
  folder: Folder,
  current: () => State,
  commit: Commit,
  progress: Progress,
  signal?: AbortSignal,
) {
  if (runningImports.has(id)) throw new Error('This PDF is already being imported.');
  runningImports.add(id);
  try {
    if (navigator.locks)
      await navigator.locks.request('monty-import-' + id, { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error('This PDF is being imported in another tab.');
        await processPractice(id, folder, current, commit, progress, signal);
      });
    else await processPractice(id, folder, current, commit, progress, signal);
  } finally {
    runningImports.delete(id);
  }
}
async function processPractice(
  id: string,
  folder: Folder,
  current: () => State,
  commit: Commit,
  progress: Progress,
  signal?: AbortSignal,
) {
  const patch = async (update: Partial<Attachment>) =>
    commit((s) => ({
      ...s,
      monty: {
        ...s.monty!,
        attachments: { ...s.monty!.attachments, [id]: { ...s.monty!.attachments[id], ...update } },
      },
    }));
  let pdf: Awaited<ReturnType<typeof openPdf>> | undefined;
  try {
    const attachment = current().monty!.attachments[id];
    if (!attachment) throw new Error('PDF was removed.');
    await patch({ status: 'reading', error: undefined });
    const file = await readAttachment(id);
    pdf = await openPdf(file.bytes);
    if (pdf.count > 500) throw new Error('Split PDFs longer than 500 pages.');
    const math = new MathsParser(),
      idioms = new IdiomsParser();
    const bankId = attachment.bankId ?? 'bank-' + id;
    const pages: PageData[] = [];
    const vocabulary: Entry[] = [];
    for (let n = 1; n <= pdf.count; n++) {
      if (signal?.aborted) throw new Error('Import paused. Completed pages are saved.');
      let page = await readJob<PageData>(`page-${id}-${n}`);
      if (!page) {
        page = await pdf.page(n);
        await saveJob(`page-${id}-${n}`, page);
      }
      if (folder.area === 'maths') math.add(page);
      else if (folder.profile === 'idioms') idioms.add(page);
      else {
        math.add(page);
        idioms.add(page);
        vocabulary.push(...parsePages([page], id).entries);
        pages.push(page);
      }
      progress(`Reading page ${n} of ${pdf.count}`, Math.round((n / pdf.count) * 55));
      if (n % 3 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    let bank: Bank;
    if (folder.area === 'maths') bank = math.finish(bankId);
    else if (folder.profile === 'idioms') {
      bank = idioms.finish(bankId);
      if (!bank.study.length) {
        for (let n = 1; n <= pdf.count; n++)
          pages.push((await readJob<PageData>(`page-${id}-${n}`))!);
        bank = await generalBank(pages, folder.area, bankId, id, pdf, progress, signal);
      }
    } else {
      const candidate = math.finish(bankId),
        phrases = idioms.finish(bankId);
      if (candidate.questions.length && !candidate.warnings.length && folder.area !== 'reading')
        bank = { ...candidate, kind: 'general' };
      else if (
        vocabulary.length >= 2 &&
        vocabulary.every((e) => e.meaningEn && (e.meaningHi || e.synonyms.length))
      ) {
        const study = vocabulary.map((e, i) => ({
          id: `${bankId}-s${i + 1}`,
          title: e.word,
          text: e.meaningEn,
          hindi: e.meaningHi,
          page: e.sources[0]?.page ?? 1,
          mnemonic: e.mnemonic,
          synonyms: e.synonyms.map((r) => r.term),
          antonyms: e.antonyms.map((r) => r.term),
          example: e.example,
        }));
        bank = { ...new IdiomsParser(study).finish(bankId), kind: 'general' };
      } else if (
        phrases.study.length >= 2 &&
        (folder.area === 'vocab' || pages.some((p) => /idioms?\s*lecture|proverbs?/i.test(p.text)))
      )
        bank = phrases;
      else bank = await generalBank(pages, folder.area, bankId, id, pdf, progress, signal);
    }
    await saveBank(bank);
    await commit((s) => {
      const a = s.monty!.attachments[id];
      if (!a) return s;
      const tests = { ...s.monty!.tests };
      if (folder.area === 'maths' && !bank.warnings.length)
        for (const test of mathsTests(bank, folder.id, id, a.name))
          if (!tests[test.id]) tests[test.id] = test;
      return {
        ...s,
        monty: {
          ...s.monty!,
          banks: {
            ...s.monty!.banks,
            [bank.id]: {
              id: bank.id,
              kind: bank.kind,
              count: bank.questions.length,
              studyCount: bank.study.length,
            },
          },
          tests,
          attachments: {
            ...s.monty!.attachments,
            [id]: {
              ...a,
              bankId: bank.id,
              count: bank.questions.length,
              status: bank.warnings.length ? 'review' : 'ready',
              error: bank.warnings.join(' ') || undefined,
            },
          },
        },
      };
    });
    progress('Saved', 100);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Import interrupted. Resume when online.';
    await patch({ status: 'pending', error: message });
    throw error;
  } finally {
    await pdf?.close();
  }
}
async function generalBank(
  pages: PageData[],
  area: Area,
  bankId: string,
  jobId: string,
  pdf: Awaited<ReturnType<typeof openPdf>>,
  progress: Progress,
  signal?: AbortSignal,
): Promise<Bank> {
  const useful = pages.filter((p) => p.text.trim().length > 30 || p.hasVisualContent);
  const outputs: GeneralOutput[] = [];
  let position = 0,
    chunk = 0;
  while (position < useful.length) {
    if (signal?.aborted) throw new Error('Import paused. Completed chunks are saved.');
    const group: PageData[] = [];
    let length = 0;
    while (position < useful.length && group.length < 3) {
      const page = useful[position];
      if (group.length && length + page.text.length > 24000) break;
      group.push(page);
      length += page.text.length;
      position++;
    }
    const key = `general-${jobId}-${chunk++}`;
    let result = await readJob<GeneralOutput>(key);
    if (!result) {
      progress(
        `Extracting study content · pages ${group.map((p) => p.number).join(', ')}`,
        55 + Math.round((position / useful.length) * 40),
      );
      result = await extractGeneral(
        {
          area: area === 'maths' ? 'vocab' : area,
          pages: await Promise.all(
            group.map(async (p) => ({
              number: p.number,
              text: readingText(p).slice(0, 30000),
              ...(p.text.trim().length < 30 || /[\uFFFD\uE000-\uF8FF]/.test(p.text)
                ? { image: await pdf.image(p.number) }
                : {}),
            })),
          ),
        },
        signal,
      );
      await saveJob(key, result);
    }
    outputs.push(result);
  }
  const study: StudyItem[] = [],
    questions: MCQ[] = [],
    seen = new Set<string>();
  for (const output of outputs) {
    for (const item of output.study) {
      const key = item.title + '|' + item.text;
      if (!study.some((x) => x.title + '|' + x.text === key))
        study.push({ ...item, id: `${bankId}-s${study.length + 1}` });
    }
    for (const q of output.questions) {
      const key = (q.stem + '|' + q.passage + '|' + q.options.join('|'))
        .toLowerCase()
        .replace(/\s+/g, ' ');
      if (seen.has(key)) continue;
      seen.add(key);
      questions.push({
        id: `${bankId}-q${questions.length + 1}`,
        number: questions.length + 1,
        stem: q.stem,
        meaningHi: '',
        passage: q.passage,
        options: q.options.map((text, i) => ({
          id: String(i),
          label: String.fromCharCode(65 + i),
          text,
        })),
        answerId: String(q.correctIndex),
        page: q.page,
        pages: [q.page],
        origin: q.generated ? 'ai' : 'pdf',
        answerOrigin: q.generated ? 'ai' : 'pdf',
        evidence: q.evidence,
        explanation: q.explanation,
      });
    }
  }
  return {
    version: 1,
    id: bankId,
    kind: 'general',
    study,
    questions,
    warnings: !questions.length
      ? [
          'Study content is saved, but no reliable quiz questions were produced. Review or retry this import.',
        ]
      : [],
  };
}
