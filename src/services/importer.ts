import { MAX_UPLOAD_BYTES, UPLOAD_SIZE_ERROR } from '../../shared/uploads';
import { type State, type Document, type Entry, uid } from '../../shared/types';
import {
  blankEntry,
  mergeEntries,
  enrichEntry,
  asAIEntry,
  needsEnrichment,
  missingFields,
  sourceExplanations,
} from '../core/vocabulary';
import { parsePages, PARSER_VERSION } from '../pdf/parser';
import { openPdf } from '../pdf/reader';
import { savePdf, readPdf } from '../storage/repository';
import { processBatch } from './api';
export type Commit = (update: (state: State) => State) => Promise<State>;
export type Progress = (message: string, percent: number) => void;
const checkCancellation = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Import paused', 'AbortError');
};
export async function addDocument(
  file: File,
  current: () => State,
  commit: Commit,
  progress: Progress,
  signal?: AbortSignal,
) {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(UPLOAD_SIZE_ERROR);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 1024)).indexOf('%PDF-') < 0)
    throw new Error('This file is not a PDF.');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  if (current().documents.some((d) => d.hash === hash))
    throw new Error(
      'This PDF is already in your library. Use Retry missing information on its card.',
    );
  const doc: Document = {
    id: uid(),
    name: file.name.replace(/\.pdf$/i, ''),
    hash,
    createdAt: Date.now(),
    entryIds: [],
    status: 'pending',
    pendingPages: [],
    error: 'Import paused before reading finished. Retry missing information.',
  };
  await savePdf(doc.id, bytes);
  await commit((s) => ({ ...s, documents: [...s.documents, doc] }));
  await processDocument(doc.id, current, commit, progress, signal);
}
export async function processDocument(
  documentId: string,
  current: () => State,
  commit: Commit,
  progress: Progress,
  signal?: AbortSignal,
) {
  let pdf: Awaited<ReturnType<typeof openPdf>> | undefined;
  const updateDoc = (state: State, update: Partial<Document>) => ({
    ...state,
    documents: state.documents.map((d) => (d.id === documentId ? { ...d, ...update } : d)),
  });
  try {
    progress('Reading PDF…', 3);
    pdf = await openPdf(await readPdf(documentId));
    if (pdf.count > 500)
      throw new Error('Please split PDFs longer than 500 pages into smaller files.');
    const pages = await pdf.pages((n, total) => {
      checkCancellation(signal);
      progress(`Reading page ${n} of ${total}`, 5 + (n / total) * 35);
    });
    const parsed = parsePages(pages, documentId);
    const existing = current().documents.find((d) => d.id === documentId)!;
    await commit((state) => {
      const result = mergeEntries(state, parsed.entries);
      const ids = [...new Set([...existing.entryIds, ...result.ids])];
      // Pages already resolved by AI need not be rediscovered after an interrupted import.
      const resolved = new Set(
        ids.flatMap(
          (id) =>
            result.state.entries[id]?.sources
              .filter((r) => r.documentId === documentId)
              .map((r) => r.page) || [],
        ),
      );
      return updateDoc(result.state, {
        entryIds: ids,
        parserVersion: PARSER_VERSION,
        pendingPages: parsed.unknownPages.filter((n) => !resolved.has(n)),
        error: undefined,
      });
    });
    const pending = current().documents.find((d) => d.id === documentId)!.pendingPages;
    for (let i = 0; i < pending.length; i++) {
      checkCancellation(signal);
      const number = pending[i],
        page = pages.find((p) => p.number === number)!;
      progress(`Finding vocabulary on page ${number}…`, 40 + (i / pending.length) * 20);
      const image =
        page.text.trim().length < 30 || /[\uFFFD\uE000-\uF8FF]/.test(page.text)
          ? await pdf.image(number)
          : undefined;
      const result = await processBatch(
        current().settings.backendUrl,
        { mode: 'discover', pages: [{ number, text: page.text, image }], entries: [] },
        signal,
      );
      if (!('candidates' in result)) throw new Error('Invalid discovery response.');
      const incoming: Entry[] = result.candidates.map((c) => {
        const e = blankEntry(c.word);
        for (const k of [
          'meaningEn',
          'meaningHi',
          'mnemonic',
          'example',
          'synonyms',
          'antonyms',
        ] as const) {
          Object.assign(e, { [k]: c[k] });
          if (c[k].length) e.origins[k] = 'pdf';
        }
        sourceExplanations(e);
        e.sources = c.sourcePages.map((page) => ({ documentId, page }));

        return e;
      });
      await commit((state) => {
        const result = mergeEntries(state, incoming),
          doc = result.state.documents.find((d) => d.id === documentId)!;
        return updateDoc(result.state, {
          entryIds: [...new Set([...doc.entryIds, ...result.ids])],
          pendingPages: doc.pendingPages.filter((n) => n !== number),
        });
      });
    }
    const doc = current().documents.find((d) => d.id === documentId)!;
    const missing = doc.entryIds.filter((id) => needsEnrichment(current().entries[id]));
    // Small patches fit more words per call; full missing entries stay small.
    const batchSize = missing.every((id) => missingFields(current().entries[id]).length <= 2)
      ? 6
      : 3;
    const failures: string[] = [];
    for (let i = 0; i < missing.length; i += batchSize) {
      checkCancellation(signal);
      const ids = missing.slice(i, i + batchSize),
        entries = ids.map((id) => current().entries[id]);
      progress(
        `Completing vocabulary ${Math.min(i + batchSize, missing.length)} of ${missing.length}…`,
        60 + (i / Math.max(missing.length, 1)) * 38,
      );
      let result;
      try {
        result = await processBatch(
          current().settings.backendUrl,
          { mode: 'enrich', pages: [], entries: entries.map(asAIEntry) },
          signal,
        );
      } catch (e) {
        checkCancellation(signal);
        const message = e instanceof Error ? e.message : 'AI is unavailable.';
        // Keep a failed batch, but do not block later words on malformed output.
        // Account/rate/network failures stop here to avoid wasting requests.
        if (!/returned incomplete|invalid output/i.test(message)) throw e;
        failures.push(message);
        continue;
      }
      if (
        !('entries' in result) ||
        result.entries.length !== entries.length ||
        ids.some((id) => !result.entries.some((e) => e.candidateId === id))
      )
        throw new Error('Incomplete AI response. Retry this batch.');
      await commit((state) => {
        const updated = { ...state.entries };
        for (const item of result.entries) {
          const original = updated[item.candidateId!];
          if (original) updated[original.id] = enrichEntry(original, item);
        }
        return { ...state, entries: updated };
      });
    }
    const latest = current().documents.find((d) => d.id === documentId)!;
    const incomplete = latest.entryIds.filter((id) =>
      needsEnrichment(current().entries[id]),
    ).length;
    await commit((state) =>
      updateDoc(state, {
        status:
          !latest.entryIds.length || incomplete || latest.pendingPages.length ? 'pending' : 'ready',
        error: !latest.entryIds.length
          ? 'No vocabulary entries were found.'
          : incomplete
            ? `${incomplete} words still need information. ${failures[0] || 'Retry when the service is available.'}`
            : undefined,
      }),
    );
    progress('Saved on this device', 100);
  } catch (e) {
    const message = signal?.aborted
      ? 'Import paused. Your progress is saved.'
      : e instanceof Error
        ? e.message
        : 'Import failed. Retry missing information.';
    await commit((state) => updateDoc(state, { status: 'pending', error: message }));
    throw new Error(message);
  } finally {
    await pdf?.close();
  }
}

// Upgrade old imports using the original PDF only. No AI calls, no page reload.
export async function repairSourceDocuments(current: () => State, commit: Commit) {
  for (const original of current().documents.filter(
    (d) => (d.parserVersion ?? 0) < PARSER_VERSION,
  )) {
    let pdf: Awaited<ReturnType<typeof openPdf>> | undefined;
    try {
      pdf = await openPdf(await readPdf(original.id));
      const parsed = parsePages(await pdf.pages(), original.id);
      await commit((state) => {
        if (!state.documents.some((d) => d.id === original.id)) return state;
        const result = mergeEntries(state, parsed.entries);
        return {
          ...result.state,
          documents: result.state.documents.map((d) => {
            if (d.id !== original.id) return d;
            const ids = [...new Set([...d.entryIds, ...result.ids])];
            const incomplete = ids.some((id) => needsEnrichment(result.state.entries[id]));
            return {
              ...d,
              entryIds: ids,
              parserVersion: PARSER_VERSION,
              status: !incomplete && !d.pendingPages.length && ids.length ? 'ready' : d.status,
              error: !incomplete && !d.pendingPages.length && ids.length ? undefined : d.error,
            };
          }),
        };
      });
    } catch {
      // Keep every existing field and retry the repair on the next opening.
    } finally {
      await pdf?.close();
    }
  }
}
