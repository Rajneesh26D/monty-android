import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { initializeAppearance, setAppearance, themeColors } from '../src/services/appearance';
let values: Map<string, string>;
let root: any;
beforeEach(() => {
  values = new Map();
  root = { dataset: {}, style: {} };
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
  vi.stubGlobal('document', {
    documentElement: root,
    querySelector: () => ({ setAttribute: vi.fn() }),
  });
  vi.stubGlobal('window', { addEventListener: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
it('applies the new AMOLED design to an existing device without touching library data', () => {
  values.set('monty-appearance-v1', JSON.stringify({ mode: 'light', color: 'red' }));
  values.set('study-data', 'keep');
  initializeAppearance();
  expect(root.dataset).toMatchObject({ mode: 'dark', theme: 'amoled' });
  expect(values.get('study-data')).toBe('keep');
});
it.each(['amoled', 'black', 'youtube', 'red', 'yellow'] as const)(
  'persists and restores %s',
  (color) => {
    expect(themeColors).toContain(color);
    setAppearance({ mode: 'dark', color });
    initializeAppearance();
    expect(root.dataset.theme).toBe(color);
  },
);
it('supports switching back to a usable light theme from a dark-only preset', () => {
  setAppearance({ mode: 'light', color: 'amoled' });
  expect(root.dataset).toMatchObject({ mode: 'light', theme: 'violet' });
});
