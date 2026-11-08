import { afterEach, expect, it, vi } from 'vitest';
import { createElement, act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { emptyState, type State } from '../shared/types';
import { upgradeState } from '../shared/migrate';
const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), fetch: vi.fn() }));
vi.mock('../src/storage/repository', () => ({
  readAttachment: mocks.read,
  saveAttachment: mocks.save,
  removeAttachment: vi.fn(),
}));
vi.mock('../src/services/cloud', () => ({ siteFetch: mocks.fetch }));
import { ArticleReading } from '../src/components/ArticleReading';
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('renders five top themes, looks up a long-pressed word, and saves its full definition into Saved', async () => {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  for (const [key, value] of Object.entries({
    window,
    document: window.document,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    navigator: { userAgent: 'test' },
    IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (fn: () => void) => {
      fn();
      return 1;
    },
  }))
    vi.stubGlobal(key, value);
  const prefs = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => prefs.get(k) || null,
    setItem: (k: string, v: string) => prefs.set(k, v),
  });
  (window.HTMLElement.prototype as any).showModal = function () {
    this.setAttribute('open', '');
  };
  (window.HTMLElement.prototype as any).close = function () {
    this.removeAttribute('open');
  };
  const meaning = {
    word: 'resilient',
    partOfSpeech: 'adjective',
    meaningEn: 'Able to recover.',
    meaningHi: 'उबरने में सक्षम',
    synonyms: ['strong', 'adaptable', 'hardy'],
    antonyms: ['fragile', 'weak', 'vulnerable'],
  };
  mocks.read.mockResolvedValue({
    bytes: new TextEncoder().encode(
      JSON.stringify({ blocks: [{ kind: 'paragraph', text: 'A resilient mind.' }] }),
    ),
  });
  mocks.fetch.mockResolvedValue(Response.json(meaning));
  let latest: State = upgradeState(emptyState());
  latest.reading = {
    articles: {
      article: {
        id: 'article',
        title: 'Habits',
        createdAt: 1,
        wordCount: 3,
        preview: 'A resilient mind.',
      },
    },
    words: {},
  };
  function Harness() {
    const [state, setState] = useState(latest);
    return createElement(ArticleReading, {
      state,
      onBack: vi.fn(),
      commit: async (update: State | ((s: State) => State)) => {
        setState((s) => {
          latest = typeof update === 'function' ? update(s) : update;
          return latest;
        });
      },
    });
  }
  root = createRoot(window.document.getElementById('root')!);
  await act(async () => root!.render(createElement(Harness)));
  expect(
    [...window.document.querySelectorAll('select[aria-label="Reading theme"] option')].map(
      (o) => o.textContent,
    ),
  ).toEqual(['Midnight', 'Paper', 'Slate', 'Ink & Gold', 'Editorial']);
  for (const theme of ['paper', 'slate', 'gold', 'editorial', 'midnight']) {
    await act(async () => {
      const select = window.document.querySelector<HTMLSelectElement>(
        'select[aria-label="Reading theme"]',
      )!;
      // Linkedom does not implement a browser's writable select.value.
      Object.defineProperty(select, 'value', { configurable: true, get: () => theme });
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    expect(window.document.querySelector('.reading-app')!.getAttribute('data-reader-theme')).toBe(
      theme,
    );
    expect(prefs.get('monty-reader-theme')).toBe(theme);
  }
  await act(async () => {
    window.document.querySelector<HTMLButtonElement>('.reader-card-open')!.click();
  });
  const word = window.document.querySelector<HTMLElement>('[aria-label="Look up resilient"]')!;
  expect(word).toBeTruthy();
  vi.useFakeTimers();
  await act(async () => {
    word.dispatchEvent(
      Object.assign(new window.Event('pointerdown', { bubbles: true }), {
        clientX: 10,
        clientY: 10,
      }),
    );
    await vi.advanceTimersByTimeAsync(490);
  });
  expect(mocks.fetch).toHaveBeenCalledWith(
    'process',
    expect.objectContaining({
      body: JSON.stringify({
        mode: 'article-word',
        word: 'resilient',
        context: 'A resilient mind.',
      }),
    }),
  );
  expect(window.document.querySelector('dialog[open]')?.textContent).toContain(meaning.meaningHi);
  await act(async () => {
    window.document.querySelector<HTMLButtonElement>('.reader-sheet .reader-save')!.click();
  });
  expect(latest.reading?.words.resilient.synonyms).toEqual(meaning.synonyms);
  expect(latest.reading?.words.resilient.antonyms).toEqual(meaning.antonyms);
  await act(async () => {
    window.document.querySelector<HTMLButtonElement>('[aria-label="Close word lookup"]')!.click();
  });
  await act(async () => {
    window.document.querySelector<HTMLButtonElement>('[aria-label="Back to articles"]')!.click();
  });
  await act(async () => {
    window.document.querySelectorAll<HTMLButtonElement>('.reader-tabs button')[1].click();
  });
  expect(window.document.querySelector('.saved-word-card')?.textContent).toContain(
    meaning.meaningHi,
  );
  expect(window.document.querySelector('.saved-word-card')?.textContent).toContain(
    'fragile · weak · vulnerable',
  );
});
