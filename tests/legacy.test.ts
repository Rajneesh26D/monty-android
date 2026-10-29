import { it, expect } from 'vitest';
import { importLegacy } from '../src/storage/backup';
it('migrates duplicate legacy entries and their bookmarks without retaining the old key', () => {
  const word = {
    id: 'one',
    w: 'Calm',
    m: 'peaceful (शांत)',
    syn: ['Serene'],
    ant: ['Agitated'],
    mn: '',
    eg: '',
  };
  const migrated = importLegacy({
    key: 'do-not-retain',
    bm: { two: 1 },
    pdfs: [
      { name: 'A', words: [word] },
      { name: 'B', words: [{ ...word, id: 'two' }] },
    ],
  });
  expect(Object.keys(migrated.entries)).toHaveLength(1);
  expect(migrated.bookmarks).toHaveLength(1);
  expect(migrated.entries[migrated.bookmarks[0]]?.word).toBe('Calm');
  expect(JSON.stringify(migrated)).not.toContain('do-not-retain');
});
