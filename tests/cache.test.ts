import { it, expect, vi } from 'vitest';
import { cachedAI } from '../server/cache';
import type { ProcessRequest } from '../shared/validation';
function bucket() {
  const values = new Map<string, string>();
  return {
    get: async (k: string) =>
      values.has(k) ? { json: async () => JSON.parse(values.get(k)!) } : null,
    put: async (k: string, v: string) => {
      values.set(k, v);
    },
  } as any;
}
const entry = (id: string, word: string) => ({
  candidateId: id,
  word,
  meaningEn: 'peaceful',
  meaningHi: 'शांत',
  mnemonic: '',
  example: 'Remain calm.',
  synonyms: [{ term: 'Serene', explanation: '' }],
  antonyms: [{ term: 'Agitated', explanation: '' }],
  sourcePages: [1],
});
it('reuses a word completion across random IDs, batches and page numbers', async () => {
  const storage = bucket();
  const generate = vi.fn(async (input: ProcessRequest) => ({
    entries: input.entries.map((e) => ({ ...e, mnemonic: 'A clear memory trick' })),
    model: 'free:test',
  }));
  await cachedAI(
    { mode: 'enrich', pages: [], entries: [entry('old', 'Calm')] },
    'key',
    storage,
    generate as any,
  );
  const result = (await cachedAI(
    {
      mode: 'enrich',
      pages: [],
      entries: [{ ...entry('new', 'Calm'), sourcePages: [7] }, entry('second', 'Quiet')],
    },
    'key',
    storage,
    generate as any,
  )) as any;
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate.mock.calls[1][0].entries.map((e) => e.word)).toEqual(['Quiet']);
  expect(result.entries[0].candidateId).toBe('new');
  expect(result.entries[0].sourcePages).toEqual([7]);
  expect(result.entries[0].mnemonic).toBe('A clear memory trick');
});
it('never calls a provider for an already complete entry', async () => {
  const generate = vi.fn();
  const complete = { ...entry('id', 'Calm'), mnemonic: 'Existing' };
  const r = (await cachedAI(
    { mode: 'enrich', pages: [], entries: [complete] },
    'key',
    bucket(),
    generate as any,
  )) as any;
  expect(generate).not.toHaveBeenCalled();
  expect(r.entries[0]).toEqual(complete);
});
