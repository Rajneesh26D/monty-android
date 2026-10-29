import { type Entry, type State, uid } from '../../shared/types';
import type { AIEntry } from '../../shared/validation';
export const normalize = (s: string) =>
  s
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(/[`’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export const canQuiz = (e: Entry) =>
  e.synonyms.length > 0 &&
  e.antonyms.length > 0 &&
  !e.synonyms.some((a) => e.antonyms.some((b) => normalize(a.term) === normalize(b.term)));
export const missingFields = (e: Entry) =>
  (['meaningEn', 'meaningHi', 'mnemonic', 'example', 'synonyms', 'antonyms'] as const).filter(
    (k) => !e[k].length,
  );
export const needsEnrichment = (e: Entry) => missingFields(e).length > 0;
export function sourceExplanations(e: Entry): Entry {
  for (const kind of ['synonyms', 'antonyms'] as const)
    for (const r of e[kind])
      if (!r.explanation)
        r.explanation = `The PDF lists “${r.term}” as ${kind === 'synonyms' ? 'a synonym' : 'an antonym'} of “${e.word}”: ${e.meaningEn}. This is the source’s ${kind === 'synonyms' ? 'similarity' : 'contrast'} in this context.`;
  return e;
}
export function blankEntry(word: string): Entry {
  return {
    id: uid(),
    word,
    meaningEn: '',
    meaningHi: '',
    mnemonic: '',
    synonyms: [],
    antonyms: [],
    example: '',
    sources: [],
    origins: {},
  };
}
export function mergeEntries(state: State, incoming: Entry[]): { state: State; ids: string[] } {
  const entries = { ...state.entries },
    ids: string[] = [];
  for (const e of incoming) {
    const match = Object.values(entries).find(
      (x) =>
        normalize(x.word) === normalize(e.word) &&
        (normalize(x.meaningEn) === normalize(e.meaningEn) ||
          x.sources.some((a) =>
            e.sources.some((b) => a.documentId === b.documentId && a.page === b.page),
          )),
    );
    if (!match) {
      entries[e.id] = structuredClone(e);
      ids.push(e.id);
      continue;
    }
    const merged = structuredClone(match);
    for (const field of ['meaningEn', 'meaningHi', 'mnemonic', 'example'] as const)
      if (
        e[field] &&
        (!merged[field] || (e.origins[field] === 'pdf' && merged.origins[field] === 'ai'))
      ) {
        merged[field] = e[field];
        merged.origins[field] = e.origins[field];
      }
    for (const field of ['synonyms', 'antonyms'] as const) {
      if (merged.origins[field] === 'edited') continue;
      if (e[field].length && e.origins[field] === 'pdf') {
        merged[field] = e[field].map((r) => ({
          ...r,
          explanation:
            merged[field].find((x) => normalize(x.term) === normalize(r.term))?.explanation ||
            r.explanation,
        }));
        merged.origins[field] = 'pdf';
      }
      for (const relation of e[field]) {
        const existing = merged[field].find((x) => normalize(x.term) === normalize(relation.term));
        if (!existing) merged[field].push(relation);
        else if (!existing.explanation) existing.explanation = relation.explanation;
      }
    }
    for (const ref of e.sources)
      if (!merged.sources.some((x) => x.documentId === ref.documentId && x.page === ref.page))
        merged.sources.push(ref);
    entries[merged.id] = merged;
    ids.push(merged.id);
  }
  return { state: { ...state, entries }, ids: [...new Set(ids)] };
}
export function enrichEntry(original: Entry, generated: AIEntry): Entry {
  const e = structuredClone(original);
  for (const key of ['meaningEn', 'meaningHi', 'mnemonic', 'example'] as const)
    if (!e[key] && generated[key]) {
      e[key] = generated[key];
      e.origins[key] = 'ai';
    }
  for (const key of ['synonyms', 'antonyms'] as const) {
    if (!e[key].length && generated[key].length) {
      const opposite = key === 'synonyms' ? 'antonyms' : 'synonyms';
      e[key] = generated[key]
        .filter((r) => !e[opposite].some((x) => normalize(x.term) === normalize(r.term)))
        .slice(0, 3);
      e.origins[key] = 'ai';
    }
  }

  return e;
}
export const asAIEntry = (e: Entry): AIEntry => ({
  ...e,
  candidateId: e.id,
  sourcePages: [...new Set(e.sources.map((s) => s.page))],
});
