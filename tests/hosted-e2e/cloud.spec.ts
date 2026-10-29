import { openVocab, studyWords } from './navigation';
import { upgradeState } from '../../shared/migrate';
import { test, expect, type Page } from '@playwright/test';
import { emptyState, type State, type Entry } from '../../shared/types';
import { blankEntry } from '../../src/core/vocabulary';
async function local(page: Page): Promise<State> {
  return page.evaluate(async () => {
    const r = indexedDB.open('vocabmaster');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
    return new Promise((resolve, reject) => {
      const q = db.transaction('state').objectStore('state').get('current');
      q.onsuccess = () => resolve(q.result);
      q.onerror = reject;
    });
  });
}
test.beforeEach(async ({ request }) => {
  const get = await request.get('/api/state');
  const etag = get.headers().etag;
  expect(
    (
      await request.put('/api/state', {
        headers: etag ? { 'If-Match': etag } : { 'If-None-Match': '*' },
        data: upgradeState(emptyState()),
      })
    ).ok(),
  ).toBeTruthy();
});
test('automatic AI, actual PDF upload, cloud restore in a fresh browser and PDF recovery', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let calls = 0;
  await page.route('**/api/process', async (route) => {
    calls++;
    const input = route.request().postDataJSON();
    await route.fulfill({
      json: {
        entries: input.entries.map((e: any) => ({
          ...e,
          meaningHi: e.meaningHi || 'अपमानजनक',
          mnemonic: e.mnemonic || 'Picture a memorable scene for ' + e.word,
          synonyms: [
            ...e.synonyms,
            ...Array.from({ length: Math.max(0, 3 - e.synonyms.length) }, (_, i) => ({
              term: 'Additional synonym ' + i,
            })),
          ].map((r: any) => ({
            ...r,
            explanation: r.term + ' has a similar sense to ' + e.word,
          })),
          antonyms: [
            ...e.antonyms,
            ...Array.from({ length: Math.max(0, 3 - e.antonyms.length) }, (_, i) => ({
              term: 'Additional antonym ' + i,
            })),
          ].map((r: any) => ({
            ...r,
            explanation: r.term + ' has an opposite sense to ' + e.word,
          })),
        })),
      },
    });
  });
  await page.goto('/');
  await openVocab(page);
  await expect(page.getByRole('heading', { name: 'Practice', exact: true })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/3-LEC-1-SLIDE.pdf');
  await expect(page.getByText('48 words', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible({ timeout: 60000 });
  // Complete source fields never go to AI just for explanations.
  expect(calls).toBeLessThan(10);
  expect(calls).toBeGreaterThan(0);
  await expect.poll(async () => (await local(page)).documents[0]?.status).toBe('ready');
  await page
    .locator('.document-card')
    .getByRole('button', { name: 'Practice', exact: true })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Berserk', exact: true })).toBeVisible();
  await page.locator('.word-card').first().getByRole('button', { name: 'Bookmark word' }).click();
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible();
  const original = await local(page);
  expect(original.documents[0].status).toBe('ready');
  expect(original.bookmarks).toHaveLength(1);
  const context = await browser.newContext({
    viewport: { width: 393, height: 851 },
    isMobile: true,
  });
  const fresh = await context.newPage();
  await fresh.goto('http://127.0.0.1:5180');
  await openVocab(fresh);
  await expect(fresh.getByText('48 words', { exact: false }).first()).toBeVisible();
  expect((await local(fresh)).bookmarks).toHaveLength(1);
  const doc = original.documents[0];
  expect(
    (await fresh.request.get('http://127.0.0.1:5180/api/pdfs/' + doc.id)).headers()['content-type'],
  ).toBe('application/pdf');
  await fresh.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(fresh.getByText('Backend address', { exact: true })).toHaveCount(0);
  const download = fresh.waitForEvent('download');
  await fresh.getByRole('button', { name: 'Export backup' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.zip$/);
  await context.close();
  expect(errors).toEqual([]);
});
test('quiz answers stay hidden, latest reattempt result and review preference restore from the cloud', async ({
  page,
  request,
  browser,
}) => {
  const state = emptyState(),
    e = {
      ...blankEntry('Calm'),
      meaningEn: 'peaceful and free from agitation',
      meaningHi: 'शांत',
      mnemonic: 'Remember calm water.',
      example: 'She remained calm.',
      synonyms: ['Serene', 'Tranquil', 'Peaceful'].map((term) => ({
        term,
        explanation: term + ' describes a peaceful state.',
      })),
      antonyms: ['Agitated', 'Restless', 'Anxious'].map((term) => ({
        term,
        explanation: term + ' contrasts with being peaceful.',
      })),
      sources: [{ documentId: 'doc1', page: 1 }],
    };
  state.entries[e.id] = e;
  state.bookmarks = [e.id];
  state.documents = [
    {
      id: 'doc1',
      name: 'Lecture One',
      hash: 'legacy:doc1',
      createdAt: Date.now(),
      entryIds: [e.id],
      status: 'ready',
      pendingPages: [],
    },
  ];
  const get = await request.get('/api/state');
  await request.put('/api/state', {
    headers: { 'If-Match': get.headers().etag },
    data: upgradeState(state),
  });
  await page.goto('/');
  await openVocab(page);
  await page.getByRole('button', { name: 'Quiz', exact: true }).last().click();
  await page.getByLabel('Lecture One').check();
  await page.getByRole('button', { name: 'Generate & start' }).click();
  async function answer(correct: boolean) {
    const q = (await local(page)).tests[0].questions[0];
    await expect(page.getByText(e.meaningEn, { exact: true })).toHaveCount(0);
    await expect(page.locator('.explanation')).toHaveCount(0);
    for (const o of q.options)
      await page
        .getByRole('group', { name: `Classify ${o.term}`, exact: true })
        .getByRole('button', {
          name: (correct ? o.kind === 'syn' : o.kind !== 'syn') ? 'Synonym' : 'Antonym',
          exact: true,
        })
        .click();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Submit test', exact: true }).click();
  }
  await answer(true);
  await expect(page.locator('.score')).toHaveText('1/1');
  await page.getByRole('button', { name: 'Analyse answers' }).click();
  await expect(page.locator('.explanation')).toHaveCount(6);
  await page.getByRole('switch').check();
  await expect(page.locator('.explanation')).toHaveCount(0);
  await page.getByRole('button', { name: 'Results', exact: true }).first().click();
  await page.getByRole('button', { name: 'Reattempt test', exact: true }).click();
  await answer(false);
  await expect(page.locator('.score')).toHaveText('0/1');
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible();
  const context = await browser.newContext();
  const fresh = await context.newPage();
  await fresh.goto('http://127.0.0.1:5180');
  await openVocab(fresh);
  await fresh.getByRole('button', { name: 'Results', exact: true }).click();
  await fresh.getByRole('button', { name: 'Analyse', exact: true }).click();
  await expect(fresh.getByRole('switch')).toBeChecked();
  await expect(fresh.locator('.explanation')).toHaveCount(0);
  const saved = await local(fresh);
  expect(saved.tests).toHaveLength(1);
  expect(saved.tests[0].latest?.score).toBe(0);
  await context.close();
});

function seed(): State {
  const s = emptyState();
  for (const [i, word] of ['Calm', 'Brisk', 'Bright'].entries()) {
    const e: Entry = {
      ...blankEntry(word),
      meaningEn: `English meaning of ${word}`,
      meaningHi: `${word} का अर्थ`,
      mnemonic: `Remember ${word}`,
      example: `This is an example with ${word}.`,
      synonyms: ['S1', 'S2', 'S3'].map((term) => ({
        term: word + term,
        explanation: `${word + term} expresses a similar idea to ${word}.`,
      })),
      antonyms: ['A1', 'A2', 'A3'].map((term) => ({
        term: word + term,
        explanation: `${word + term} expresses an opposite idea to ${word}.`,
      })),
      sources: [{ documentId: i === 2 ? 'doc2' : 'doc1', page: 1 }],
    };
    s.entries[e.id] = e;
    if (i < 2) s.bookmarks.push(e.id);
  }
  for (const id of ['doc1', 'doc2'])
    s.documents.push({
      id,
      name: id === 'doc1' ? 'Lecture One' : 'Lecture Two',
      hash: 'legacy:' + id,
      createdAt: Date.now(),
      entryIds: Object.values(s.entries)
        .filter((e) => e.sources[0].documentId === id)
        .map((e) => e.id),
      status: 'ready',
      pendingPages: [],
    });
  return s;
}

async function restore(page: Page) {
  const r = await page.request.get('http://127.0.0.1:5180/api/state');
  await page.request.put('http://127.0.0.1:5180/api/state', {
    headers: { 'If-Match': r.headers().etag },
    data: upgradeState(seed()),
  });
  await page.goto('/');
  await openVocab(page);
  await expect(page.getByRole('heading', { name: 'Practice', exact: true })).toBeVisible();
}

test('combined and changing bookmark collections create independent snapshots, and unfinished tests resume', async ({
  page,
}) => {
  await restore(page);
  await page.getByRole('button', { name: 'Quiz', exact: true }).last().click();
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('button', { name: 'Generate & start' }).click();
  let s = await local(page);
  await expect(page.getByText('Question 1 of 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(page.getByText('Question 2 of 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.getByText('Question 1 of 3', { exact: true })).toBeVisible();
  expect(s.tests[0].questions).toHaveLength(3);
  expect(s.tests[0].source).toBe('combined');
  const q = s.tests[0].questions[0];
  await page
    .getByRole('group', { name: `Classify ${q.options[0].term}`, exact: true })
    .getByRole('button', { name: 'Synonym', exact: true })
    .click();
  await expect
    .poll(async () => (await local(page)).tests[0].draft?.answers[q.id]?.[q.options[0].id])
    .toBe('syn');
  await page.reload();
  await openVocab(page);
  await page.getByRole('button', { name: 'Quiz', exact: true }).last().click();
  await page.getByRole('button', { name: 'Resume test' }).click();
  await expect(
    page
      .getByRole('group', { name: `Classify ${q.options[0].term}`, exact: true })
      .getByRole('button', { name: 'Synonym', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Save & exit' }).click();
  await page.locator('.quiz-setup').getByRole('button', { name: 'Bookmarks', exact: true }).click();
  await page.getByRole('button', { name: 'Generate & start' }).click();
  expect((await local(page)).tests[0].questions).toHaveLength(2);
  await page.getByRole('button', { name: 'Save & exit' }).click();
  await studyWords(page);
  await page
    .getByRole('heading', { name: 'Bright', exact: true })
    .locator('..')
    .getByRole('button', { name: 'Bookmark word' })
    .click();
  await page.getByRole('button', { name: 'Quiz', exact: true }).last().click();
  await page.getByRole('button', { name: 'Generate & start' }).click();
  s = await local(page);
  expect(s.tests.map((t) => t.questions.length)).toEqual([3, 2, 3]);
});
test('AI completes changed layouts and scans, with resumable imports after quota failure', async ({
  page,
}) => {
  let discovery = 0,
    enrichment = 0,
    quota = true,
    sawImage = false;
  await page.route('**/api/process', async (route) => {
    const request = route.request(),
      headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const data = request.postDataJSON();
    if (request.url().endsWith('/pair'))
      return route.fulfill({ json: { token: 'a'.repeat(64) }, headers });
    if (data.mode === 'discover') {
      discovery++;
      sawImage ||= !!data.pages[0].image;
      const words = data.pages[0].image ? ['Berserk'] : ['Alacrity', 'Ebullient'];
      return route.fulfill({
        json: {
          candidates: words.map((word) => ({
            word,
            meaningEn: '',
            meaningHi: '',
            sourcePages: [1],
          })),
        },
        headers,
      });
    }
    enrichment++;
    if (quota)
      return route.fulfill({
        status: 429,
        json: { error: 'Free daily quota exhausted. Import is saved.' },
        headers,
      });
    return route.fulfill({
      json: {
        entries: data.entries.map((e: any) => ({
          ...e,
          meaningEn: `Meaning of ${e.word}`,
          meaningHi: 'हिन्दी अर्थ',
          mnemonic: 'A useful memory trick.',
          example: `An example using ${e.word}.`,
          synonyms: ['Similar one', 'Similar two', 'Similar three'].map((term) => ({
            term,
            explanation: 'This term shares the intended sense.',
          })),
          antonyms: ['Opposite one', 'Opposite two', 'Opposite three'].map((term) => ({
            term,
            explanation: 'This term expresses the opposite sense.',
          })),
        })),
      },
      headers,
    });
  });
  await page.goto('/');
  await openVocab(page);
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/unfamiliar-layout.pdf');
  await expect(
    page.getByText('Free daily quota exhausted. Import is saved.', { exact: true }).first(),
  ).toBeVisible();
  expect(discovery).toBe(1);
  expect(Object.keys((await local(page)).entries)).toHaveLength(2);
  quota = false;
  await page.reload();
  await openVocab(page);
  await page.getByRole('button', { name: 'Retry missing information' }).click();
  await expect(page.getByRole('button', { name: 'Retry missing information' })).toHaveCount(0);
  expect(discovery).toBe(1);
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/scanned-slide.pdf');
  await expect(page.getByText('3 words', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry missing information' })).toHaveCount(0);
  expect(sawImage).toBe(true);
  const state = await local(page);
  expect(Object.keys(state.entries)).toHaveLength(3);
  expect(state.documents.every((d) => d.status === 'ready')).toBe(true);
  expect(enrichment).toBe(3);
  await studyWords(page);
  await expect(page.getByRole('heading', { name: 'Alacrity', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Berserk', exact: true })).toBeVisible();
});
