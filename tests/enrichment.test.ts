import { it, expect } from 'vitest';
import {
  blankEntry,
  needsEnrichment,
  enrichEntry,
  mergeEntries,
  asAIEntry,
} from '../src/core/vocabulary';
import { emptyState } from '../shared/types';
const source = () => ({
  ...blankEntry('Calm'),
  meaningEn: 'peaceful',
  meaningHi: 'शांत',
  mnemonic: 'Source mnemonic',
  example: 'Remain calm.',
  synonyms: [
    { term: 'Serene', explanation: '' },
    { term: 'Quiet', explanation: '' },
  ],
  antonyms: [{ term: 'Agitated', explanation: '' }],
  origins: { mnemonic: 'pdf' as const },
  sources: [{ documentId: 'd', page: 1 }],
});
it('does not call AI for supplied lists shorter than three or absent explanations', () => {
  expect(needsEnrichment(source())).toBe(false);
  expect(needsEnrichment({ ...source(), mnemonic: '' })).toBe(true);
});
it('fills only missing fields without replacing supplied content or expanding lists', () => {
  const original = source(),
    generated = {
      ...asAIEntry(original),
      mnemonic: 'Changed',
      example: 'Changed',
      synonyms: [{ term: 'Peaceful', explanation: 'AI' }],
    };
  expect(enrichEntry(original, generated)).toEqual(original);
  const missing = { ...original, mnemonic: '' };
  expect(enrichEntry(missing, generated).mnemonic).toBe('Changed');
});
it('repairs old AI mnemonics from source text but keeps deliberate manual edits', () => {
  const original = {
    ...source(),
    mnemonic: 'AI replacement',
    origins: { mnemonic: 'ai' as const },
  };
  const s = emptyState();
  s.entries[original.id] = original;
  const incoming = { ...source(), id: 'retry' };
  expect(mergeEntries(s, [incoming]).state.entries[original.id].mnemonic).toBe('Source mnemonic');
  original.origins.mnemonic = 'edited' as any;
  expect(mergeEntries(s, [incoming]).state.entries[original.id].mnemonic).toBe('AI replacement');
});

it('source repair keeps edited relation lists and existing specific explanations', () => {
  const original = source();
  original.synonyms[0].explanation = 'Serene means untroubled, sharing the peaceful sense.';
  const state = emptyState();
  state.entries[original.id] = original;
  const incoming = { ...source(), id: 'retry', origins: { synonyms: 'pdf' as const } };
  expect(mergeEntries(state, [incoming]).state.entries[original.id].synonyms[0].explanation).toBe(
    original.synonyms[0].explanation,
  );
  original.origins = { synonyms: 'edited' } as any;
  original.synonyms = [{ term: 'Tranquil', explanation: 'A manual correction.' }];
  expect(mergeEntries(state, [incoming]).state.entries[original.id].synonyms).toEqual(
    original.synonyms,
  );
});
