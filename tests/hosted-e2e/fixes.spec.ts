import { openVocab, studyWords } from './navigation';
import { upgradeState } from '../../shared/migrate';
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { emptyState, type State } from '../../shared/types';
import { blankEntry } from '../../src/core/vocabulary';
function library(count = 49): State {
  const s = emptyState();
  for (let i = 0; i < count; i++) {
    const e = {
      ...blankEntry('Word ' + i),
      meaningEn: 'Meaning ' + i,
      meaningHi: 'हिन्दी अर्थ',
      mnemonic: 'Memory ' + i,
      example: 'Example ' + i,
      synonyms: ['Similar A', 'Similar B', 'Similar C'].map((term) => ({
        term,
        explanation: 'Similar sense.',
      })),
      antonyms: ['Opposite A', 'Opposite B', 'Opposite C'].map((term) => ({
        term,
        explanation: 'Opposite sense.',
      })),
    };
    s.entries[e.id] = e;
  }
  const ids = Object.keys(s.entries);
  s.documents = [
    {
      id: 'a',
      name: 'PDF A',
      hash: 'a',
      createdAt: 1,
      status: 'ready',
      pendingPages: [],
      entryIds: ids.slice(0, Math.ceil(count / 2)),
      parserVersion: 2,
    },
    {
      id: 'b',
      name: 'PDF B',
      hash: 'b',
      createdAt: 2,
      status: 'ready',
      pendingPages: [],
      entryIds: ids.slice(Math.ceil(count / 2)),
      parserVersion: 2,
    },
  ];
  return s;
}
async function seed(request: APIRequestContext, s: State) {
  const r = await request.get('/api/state');
  expect(
    (
      await request.put('/api/state', {
        headers: r.headers().etag ? { 'If-Match': r.headers().etag } : { 'If-None-Match': '*' },
        data: upgradeState(s),
      })
    ).ok(),
  ).toBeTruthy();
}
async function state(page: Page): Promise<State> {
  return page.evaluate(async () => {
    const req = indexedDB.open('vocabmaster');
    const db = await new Promise<IDBDatabase>((ok, no) => {
      req.onsuccess = () => ok(req.result);
      req.onerror = no;
    });
    return new Promise((ok, no) => {
      const r = db.transaction('state').objectStore('state').get('current');
      r.onsuccess = () => ok(r.result);
      r.onerror = no;
    });
  });
}
const nav = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Folder navigation' })
    .getByRole('button', { name, exact: true });
async function bookmark(page: Page, index: number) {
  await studyWords(page);
  await page
    .locator('.word-card')
    .nth(index)
    .getByRole('button', { name: 'Bookmark word', exact: true })
    .click();
}
test('two phones merge stale revisions and keep both bookmarks with no reload', async ({
  page,
  browser,
  request,
}) => {
  await seed(request, library(4));
  await page.goto('/');
  await openVocab(page);
  const context = await browser.newContext({
    viewport: { width: 393, height: 851 },
    isMobile: true,
  });
  const other = await context.newPage();
  await other.goto('http://127.0.0.1:5180');
  await openVocab(other);
  await other.getByRole('heading', { name: 'Practice', exact: true }).waitFor();
  await page.evaluate(() => {
    (window as any).sentinel = 'keep-screen';
  });
  await bookmark(page, 0);
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible();
  await bookmark(other, 1);
  await expect(other.getByText('Saved online', { exact: true })).toBeVisible();
  await expect
    .poll(
      async () =>
        ((await (await request.get('/api/state')).json()).state as State).bookmarks.length,
    )
    .toBe(2);
  expect(await page.evaluate(() => (window as any).sentinel)).toBe('keep-screen');
  await page.reload();
  await openVocab(page);
  await page.getByRole('heading', { name: 'Practice', exact: true }).waitFor();
  expect((await state(page)).bookmarks).toHaveLength(2);
  await expect(page.getByText('Sync conflict', { exact: false })).toHaveCount(0);
  await context.close();
});
test('a lost save receipt and transformed ETag recover automatically without losing edits', async ({
  page,
  request,
}) => {
  await seed(request, library(3));
  let dropped = false;
  await page.route('**/api/state', async (route) => {
    if (route.request().method() === 'PUT' && !dropped) {
      dropped = true;
      await route.fetch();
      return route.abort('failed');
    }
    const r = await route.fetch();
    return route.fulfill({ response: r, headers: { ...r.headers(), etag: 'W/"proxy-etag"' } });
  });
  await page.goto('/');
  await openVocab(page);
  await bookmark(page, 0);
  await expect(page.getByRole('button', { name: 'Retry sync' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry sync' }).click();
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible();
  expect((await (await request.get('/api/state')).json()).state.bookmarks).toHaveLength(1);
  await bookmark(page, 1);
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible();
  expect((await (await request.get('/api/state')).json()).state.bookmarks).toHaveLength(2);
});
test('bookmarks have full cards, removal and a visible quiz word list', async ({
  page,
  request,
}) => {
  const s = library(4);
  s.bookmarks = Object.keys(s.entries).slice(0, 2);
  await seed(request, s);
  await page.goto('/');
  await openVocab(page);
  await nav(page, 'Bookmarks').click();
  await expect(page.getByRole('heading', { name: 'Bookmarks', exact: true })).toBeVisible();
  const card = page.locator('.word-card').first();
  for (const text of [
    'Meaning 0',
    'हिन्दी अर्थ',
    'Memory 0',
    'Similar A',
    'Opposite A',
    'Example 0',
  ])
    await expect(card.getByText(text, { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Remove bookmark' }).click();
  await expect(page.locator('.word-card')).toHaveCount(1);
  await nav(page, 'Quiz').click();
  await page.locator('.quiz-setup').getByRole('button', { name: 'Bookmarks', exact: true }).click();
  await expect(
    page.locator('.bookmark-preview').getByText('Word 1', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.bookmark-preview').getByText('Word 0', { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
test('custom split tests are disjoint, deletable with confirmation and remain deleted after reload', async ({
  page,
  request,
}) => {
  await seed(request, library());
  await page.goto('/');
  await openVocab(page);
  await nav(page, 'Quiz').click();
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByLabel('Split tests').selectOption('5');
  await expect(
    page.getByText('10 + 10 + 10 + 10 + 9 questions · 5 separate results'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  await page.getByLabel('Custom questions').fill('17');
  await page.getByLabel('Split tests').selectOption('3');
  await expect(page.getByText('6 + 6 + 5 questions · 3 separate results')).toBeVisible();
  await page.getByRole('button', { name: 'Create 3 tests & start' }).click();
  await page.getByRole('button', { name: 'Save & exit' }).click();
  const before = await state(page);
  expect(before.tests.map((t) => t.questions.length)).toEqual([6, 6, 5]);
  expect(new Set(before.tests.flatMap((t) => t.questions.map((q) => q.entry.id))).size).toBe(17);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page
    .getByRole('button', { name: /Delete test/ })
    .first()
    .click();
  await expect(page.locator('.test-card')).toHaveCount(3);
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('Permanently delete');
    return dialog.accept();
  });
  await page
    .getByRole('button', { name: /Delete test/ })
    .first()
    .click();
  await expect(page.locator('.test-card')).toHaveCount(2);
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible();
  await page.reload();
  await openVocab(page);
  await nav(page, 'Quiz').click();
  await expect(page.locator('.test-card')).toHaveCount(2);
  expect((await state(page)).tests.some((t) => t.id === before.tests[0].id)).toBe(false);
});
test('legacy conflict metadata recovers on opening and keeps phone-only progress', async ({
  page,
  request,
}) => {
  const s = library(3);
  await seed(request, s);
  await page.goto('/');
  await openVocab(page);
  await page.getByRole('heading', { name: 'Practice', exact: true }).waitFor();
  await page.evaluate(async (id) => {
    const req = indexedDB.open('vocabmaster');
    const db = await new Promise<IDBDatabase>((ok) => {
      req.onsuccess = () => ok(req.result);
    });
    const tx = db.transaction(['state', 'private'], 'readwrite');
    const r = tx.objectStore('state').get('current');
    r.onsuccess = () => {
      const s = r.result;
      s.bookmarks = [id];
      tx.objectStore('state').put(s, 'current');
    };
    tx.objectStore('private').put(
      { etag: '"old"', dirty: true, seq: 1, pdfs: [], deleted: [] },
      'cloud',
    );
    await new Promise<void>((ok) => {
      tx.oncomplete = () => ok();
    });
  }, Object.keys(s.entries)[0]);
  await page.reload();
  await openVocab(page);
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible();
  expect((await (await request.get('/api/state')).json()).state.bookmarks).toHaveLength(1);
  await expect(page.getByText('Sync conflict', { exact: false })).toHaveCount(0);
});

test('two tabs in one browser do not overwrite each other’s edits', async ({
  page,
  request,
  context,
}) => {
  await seed(request, library(4));
  await page.goto('/');
  await openVocab(page);
  await page.getByRole('heading', { name: 'Practice', exact: true }).waitFor();
  const other = await context.newPage();
  await other.goto('http://127.0.0.1:5180');
  await openVocab(other);
  await other.getByRole('heading', { name: 'Practice', exact: true }).waitFor();
  await Promise.all([bookmark(page, 0), bookmark(other, 1)]);
  await expect
    .poll(
      async () =>
        ((await (await request.get('/api/state')).json()).state as State).bookmarks.length,
    )
    .toBe(2);
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible();
  await other.close();
});

test('old imports recover source mnemonics without an AI request', async ({ page, request }) => {
  const s = emptyState(),
    e = {
      ...blankEntry('Overstrung'),
      meaningEn: '(of a person) extremely nervous or Stressed.',
      meaningHi: 'हिन्दी',
      mnemonic: 'Incorrect generated trick',
      origins: { mnemonic: 'ai' as const },
      sources: [{ documentId: 'repair', page: 4 }],
    };
  s.entries[e.id] = e;
  s.documents = [
    {
      id: 'repair',
      name: 'Old slide import',
      hash: 'old',
      createdAt: 1,
      entryIds: [e.id],
      status: 'pending',
      pendingPages: [],
    },
  ];
  await seed(request, s);
  const { readFileSync } = await import('node:fs');
  expect(
    (
      await request.put('/api/pdfs/repair', {
        headers: { 'Content-Type': 'application/pdf' },
        data: readFileSync('tests/fixtures/3-LEC-1-SLIDE.pdf'),
      })
    ).ok(),
  ).toBeTruthy();
  let ai = 0;
  await page.route('**/api/process', (route) => {
    ai++;
    return route.abort();
  });
  await page.goto('/');
  await openVocab(page);
  await expect
    .poll(async () => (await state(page))?.entries[e.id]?.mnemonic)
    .toBe('jiski strings jada kheeche hui hon');
  expect((await state(page)).entries[e.id].origins.mnemonic).toBe('pdf');
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible();
  expect(ai).toBe(0);
});
test('discovery copies supplied fields instead of generating them a second time', async ({
  page,
  request,
}) => {
  await seed(request, emptyState());
  let calls = 0;
  await page.route('**/api/process', (route) => {
    const input = route.request().postDataJSON();
    expect(input.mode).toBe('discover');
    calls++;
    return route.fulfill({ json: { candidates: [{ ...entryForDiscovery(), sourcePages: [1] }] } });
  });
  await page.goto('/');
  await openVocab(page);
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/unfamiliar-layout.pdf');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
  await expect.poll(async () => (await state(page)).documents[0]?.status).toBe('ready');
  expect(calls).toBe(1);
  const e = Object.values((await state(page)).entries)[0];
  expect(e.mnemonic).toBe('Copied source trick');
  expect(e.origins.mnemonic).toBe('pdf');
});
function entryForDiscovery() {
  return {
    word: 'Alacrity',
    meaningEn: 'eager readiness',
    meaningHi: 'तत्परता',
    mnemonic: 'Copied source trick',
    example: 'She helped with alacrity.',
    synonyms: [{ term: 'Eagerness', explanation: '' }],
    antonyms: [{ term: 'Reluctance', explanation: '' }],
  };
}
