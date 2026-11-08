import { expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { emptyState } from '../shared/types';
import { upgradeState } from '../shared/migrate';
const storage = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), replace: vi.fn() }));
vi.mock('../src/storage/repository', () => ({
  readAttachment: storage.read,
  saveAttachment: storage.save,
  replaceState: storage.replace,
  restoreTimers: async (s: unknown) => s,
}));
import { createBackup, importBackup } from '../src/storage/backup';
it('backs up article bodies with saved vocabulary and restores them together', async () => {
  const s = upgradeState(emptyState());
  s.reading = {
    articles: {
      article: {
        id: 'article',
        title: 'Read',
        createdAt: 1,
        wordCount: 3,
        preview: 'A resilient mind.',
      },
    },
    words: {
      resilient: {
        id: 'resilient',
        word: 'resilient',
        partOfSpeech: 'adjective',
        meaningEn: 'Able to recover.',
        meaningHi: 'उबरने में सक्षम',
        synonyms: ['strong', 'adaptable', 'hardy'],
        antonyms: ['fragile', 'weak', 'vulnerable'],
        context: 'A resilient mind.',
        articleTitle: 'Read',
        savedAt: 1,
      },
    },
  };
  const body = new TextEncoder().encode(
    JSON.stringify({ blocks: [{ kind: 'paragraph', text: 'A resilient mind.' }] }),
  );
  storage.read.mockResolvedValue({ bytes: body, mime: 'application/json' });
  const zip = await createBackup(s);
  const files = unzipSync(zip);
  expect(strFromU8(files['files/article'])).toContain('A resilient mind.');
  expect(JSON.parse(strFromU8(files['monty.json'])).reading.words.resilient.meaningHi).toBe(
    'उबरने में सक्षम',
  );
  const restored = await importBackup({
    name: 'Monty.zip',
    size: zip.length,
    arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength),
  } as File);
  expect(restored.reading).toEqual(s.reading);
  expect(storage.save).toHaveBeenCalledWith('article', body, 'application/json');
  expect(storage.replace).toHaveBeenCalledWith(expect.objectContaining({ reading: s.reading }));
});
