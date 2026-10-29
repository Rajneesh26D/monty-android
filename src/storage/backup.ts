import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { upgradeState } from '../../shared/migrate';
import { stateSchema } from '../../shared/state-schema';
import { type State, type Entry, emptyState, uid } from '../../shared/types';
import { blankEntry, mergeEntries, normalize } from '../core/vocabulary';
import { splitMeaning } from '../pdf/parser';
import {
  download,
  readPdf,
  savePdf,
  saveState,
  readAttachment,
  saveAttachment,
  replaceState,
  restoreTimers,
} from './repository';
export async function createBackup(state: State) {
  const files: Record<string, Uint8Array> = {};
  const safe = await restoreTimers(structuredClone(state));
  safe.settings.backendUrl = '';
  for (const test of safe.tests) if (test.draft?.clock) test.draft.clock.paused = true;
  for (const test of Object.values(safe.monty?.tests ?? {}))
    if (test.draft) test.draft.clock.paused = true;
  files[state.version === 2 ? 'monty.json' : 'vocabmaster.json'] = strToU8(JSON.stringify(safe));
  for (const doc of state.documents) {
    try {
      files[`pdfs/${doc.id}.pdf`] = await readPdf(doc.id);
    } catch {
      if (!doc.hash.startsWith('legacy:'))
        throw new Error(
          `Original PDF missing for ${doc.name}; restore it before making a complete backup.`,
        );
    }
  }
  if (state.monty) {
    const ids = [
      ...new Set([...Object.keys(state.monty.attachments), ...Object.keys(state.monty.banks)]),
    ];
    let total = Object.values(files).reduce((n, f) => n + f.length, 0);
    for (const id of ids) {
      const file = await readAttachment(id);
      total += file.bytes.length;
      if (total > 195 * 1024 * 1024)
        throw new Error('This complete backup exceeds 195 MB. Your online files remain saved.');
      files['files/' + id] = file.bytes;
    }
  }
  return zipSync(files, { level: 0 });
}
export async function exportBackup(state: State) {
  await download(
    await createBackup(state),
    `Monty-${new Date().toISOString().slice(0, 10)}.zip`,
    'application/zip',
  );
}
export async function importBackup(file: File): Promise<State> {
  if (file.size > 200 * 1024 * 1024) throw new Error('Backup is larger than 200 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (/\.json$/i.test(file.name)) {
    const value = JSON.parse(strFromU8(bytes));
    const state = upgradeState(
      value?.version === 1 || value?.version === 2
        ? (stateSchema.parse(value) as State)
        : importLegacy(value),
    );
    state.settings.backendUrl = '';
    await replaceState(state);
    return state;
  }
  const files = unzipSync(bytes, {
    filter: (file) =>
      file.originalSize < 200 * 1024 * 1024 &&
      (['vocabmaster.json', 'monty.json'].includes(file.name) ||
        /^pdfs\/[a-f0-9-]+\.pdf$/i.test(file.name) ||
        /^files\/[A-Za-z0-9_-]{1,100}$/.test(file.name)),
  });
  const manifest = files['monty.json'] ?? files['vocabmaster.json'];
  if (!manifest) throw new Error('This is not a Monty or VocabMaster backup.');
  const state = upgradeState(stateSchema.parse(JSON.parse(strFromU8(manifest))) as State);
  if (Object.values(files).reduce((n, f) => n + f.length, 0) > 250 * 1024 * 1024)
    throw new Error('Unpacked backup is too large.');
  for (const doc of state.documents) {
    if (!files[`pdfs/${doc.id}.pdf`] && !doc.hash.startsWith('legacy:'))
      throw new Error(`Backup is missing the PDF for ${doc.name}.`);
    if (files[`pdfs/${doc.id}.pdf`]) await savePdf(doc.id, files[`pdfs/${doc.id}.pdf`]);
  }
  if (state.monty)
    for (const id of [
      ...new Set([...Object.keys(state.monty.attachments), ...Object.keys(state.monty.banks)]),
    ]) {
      const bytes = files['files/' + id];
      if (!bytes) throw new Error('Backup is missing an attachment or question bank.');
      await saveAttachment(
        id,
        bytes,
        state.monty.banks[id]
          ? 'application/json'
          : (state.monty.attachments[id]?.mime ?? 'application/octet-stream'),
      );
    }
  state.settings.backendUrl = '';
  await replaceState(state);
  return state;
}
export function importLegacy(raw: any): State {
  if (!Array.isArray(raw?.pdfs))
    throw new Error('Expected a VocabMaster backup or the old vm2 JSON export.');
  let state = emptyState();
  for (const pdf of raw.pdfs) {
    if (!Array.isArray(pdf.words)) continue;
    const documentId = uid();
    const marked: Entry[] = [];
    const incoming = pdf.words
      .filter((w: any) => typeof w.w === 'string' && w.w.trim())
      .map((w: any) => {
        const e = blankEntry(w.w);
        Object.assign(e, splitMeaning(String(w.m || '')));
        e.mnemonic = String(w.mn || '');
        e.example = String(w.eg || '');
        e.synonyms = (Array.isArray(w.syn) ? w.syn : []).map((term: any) => ({
          term: String(term),
          explanation: '',
        }));
        e.antonyms = (Array.isArray(w.ant) ? w.ant : []).map((term: any) => ({
          term: String(term),
          explanation: '',
        }));
        e.sources = [{ documentId, page: 1 }];
        if (raw.bm?.[w.id]) marked.push(e);
        return e;
      });
    const merged = mergeEntries(state, incoming);
    state = merged.state;
    for (const entry of marked) {
      const match = Object.values(state.entries).find(
        (e) =>
          normalize(e.word) === normalize(entry.word) &&
          normalize(e.meaningEn) === normalize(entry.meaningEn),
      );
      if (match && !state.bookmarks.includes(match.id)) state.bookmarks.push(match.id);
    }
    state.documents.push({
      id: documentId,
      name: String(pdf.name || 'Imported list'),
      hash: `legacy:${documentId}`,
      createdAt: Date.now(),
      entryIds: merged.ids,
      status: 'pending',
      pendingPages: [],
      error: 'Original PDF was not saved by the old app. Reimport it to restore source pages.',
    });
  }
  return state;
}
