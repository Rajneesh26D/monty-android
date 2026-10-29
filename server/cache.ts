import { type ProcessRequest, type AIEntry } from '../shared/validation';
import { runAI } from './models';
const fields = ['meaningEn', 'meaningHi', 'mnemonic', 'example', 'synonyms', 'antonyms'] as const;
const digest = async (value: unknown) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))),
    ),
  )
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
// Per-word keys survive new candidate IDs, different batches and PDF page numbers.
// Supplied text remains part of the key; different senses cannot share a result.
export async function cachedAI(
  input: ProcessRequest,
  key: string,
  bucket: R2Bucket,
  generate = runAI,
) {
  if (input.mode === 'discover') {
    const path = 'owner/ai/v4-discover-' + (await digest(input.pages)) + '.json';
    const cached = await bucket.get(path);
    if (cached) return cached.json();
    const result = await generate(input, key, async () => {});
    await bucket.put(path, JSON.stringify(result));
    return result;
  }
  const keys = await Promise.all(
    input.entries.map((e) =>
      digest({
        word: e.word,
        ...Object.fromEntries(
          fields.map((k) => [
            k,
            k === 'synonyms' || k === 'antonyms' ? e[k].map((r) => r.term) : e[k],
          ]),
        ),
      }),
    ),
  );
  const found = await Promise.all(keys.map((k) => bucket.get('owner/ai/v4-word-' + k + '.json')));
  const entries: (AIEntry | undefined)[] = await Promise.all(
    found.map(async (object, i) => {
      const original = input.entries[i];
      if (fields.every((k) => original[k].length)) return original;
      if (!object) return undefined;
      const saved = await object.json<AIEntry>();
      return {
        ...saved,
        candidateId: original.candidateId,
        word: original.word,
        sourcePages: original.sourcePages,
      };
    }),
  );
  const missing = input.entries.filter((_, i) => !entries[i]);
  let model = 'cached';
  if (missing.length) {
    const result = await generate({ ...input, entries: missing }, key, async () => {});
    if (!('entries' in result)) throw new Error('Invalid enrichment result');
    model = result.model;
    await Promise.all(
      result.entries.map(async (e) => {
        const i = input.entries.findIndex((x) => x.candidateId === e.candidateId);
        if (i < 0) throw new Error('Invalid candidate');
        entries[i] = e;
        await bucket.put('owner/ai/v4-word-' + keys[i] + '.json', JSON.stringify(e));
      }),
    );
  }
  return { entries, model };
}
