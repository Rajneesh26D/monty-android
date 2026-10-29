import { test, expect, type Page } from '@playwright/test';
import { emptyState, type State, type Entry } from '../../shared/types';
import { blankEntry } from '../../src/core/vocabulary';
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
async function readState(page: Page): Promise<State> {
  return page.evaluate(async () => {
    const request = indexedDB.open('vocabmaster');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = reject;
    });
    return new Promise((resolve, reject) => {
      const r = db.transaction('state').objectStore('state').get('current');
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
  });
}
async function restore(page: Page, state = seed()) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'seed.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(state)),
    });
  await expect(page.getByText('Backup restored.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
}
async function answerTest(page: Page, correct: boolean) {
  const test = (await readState(page)).tests[0];
  for (let n = 0; n < test.questions.length; n++) {
    const q = test.questions[n];
    await expect(page.getByRole('heading', { name: q.entry.word, exact: true })).toBeVisible();
    await expect(page.getByText(q.entry.meaningEn, { exact: true })).toHaveCount(0);
    for (const o of q.options)
      await page
        .getByRole('group', { name: `Classify ${o.term}`, exact: true })
        .getByRole('button', {
          name:
            (correct ? o.kind : o.kind === 'ant' ? 'syn' : 'ant') === 'syn' ? 'Synonym' : 'Antonym',
          exact: true,
        })
        .click();
    await expect(page.locator('.explanation')).toHaveCount(0);
    await page
      .getByRole('button', {
        name: n === test.questions.length - 1 ? 'Finish test' : 'Save & next',
        exact: true,
      })
      .click();
  }
}
test('imports actual slides offline, retains Hindi and examples, and survives reload and backup restore', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/3-LEC-1-SLIDE.pdf');
  await expect(page.getByText('48 words', { exact: false }).first()).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByRole('button', { name: 'Retry missing information' })).toBeVisible();
  await page.getByRole('button', { name: 'Learn', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Berserk', exact: true })).toBeVisible();
  await expect(page.locator('.word-card').first().locator('[lang=hi]')).toContainText('पागलों');
  await expect(
    page.locator('.word-card').first().getByText('Example', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText('48 words', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.zip$/);
  const path = await file.path();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const r = indexedDB.deleteDatabase('unused');
        r.onsuccess = () => resolve();
      }),
  );
  page.once('dialog', (d) => d.accept());
  await page.locator('input[type=file]').setInputFiles(path!);
  await expect(page.getByText('Backup restored.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test('conceals all answers until completion, persists practice toggle, and replaces only the latest result', async ({
  page,
}) => {
  await restore(page);
  await page.getByRole('button', { name: 'Quiz', exact: true }).last().click();
  await page.getByLabel('Lecture One').check();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('button', { name: 'Generate & start' }).click();
  await answerTest(page, true);
  await expect(page.locator('.score')).toHaveText('2/2');
  await page.getByRole('button', { name: 'Analyse answers' }).click();
  await expect(page.locator('.explanation')).toHaveCount(6);
  await page.getByRole('switch').check();
  await expect(page.locator('.explanation')).toHaveCount(0);
  const s = await readState(page),
    q = s.tests[0].questions[0];
  await expect(page.getByRole('button', { name: 'Save and show answers' })).toBeDisabled();
  for (const o of q.options)
    await page
      .getByRole('group', { name: `Classify ${o.term}`, exact: true })
      .getByRole('button', { name: 'Synonym', exact: true })
      .click();
  await page.getByRole('button', { name: 'Save and show answers' }).click();
  await expect(page.locator('.explanation')).toHaveCount(6);
  expect((await readState(page)).tests[0].latest?.score).toBe(2);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.explanation')).toHaveCount(0);
  await expect(page.getByRole('switch')).toBeChecked();
  await page.getByRole('button', { name: 'Results', exact: true }).first().click();
  await page.getByRole('button', { name: 'Reattempt test', exact: true }).click();
  expect((await readState(page)).tests[0].latest?.score).toBe(2);
  await answerTest(page, false);
  await expect(page.locator('.score')).toHaveText('0/2');
  await page.reload();
  await page.getByRole('button', { name: 'Results', exact: true }).click();
  await page.getByRole('button', { name: 'Analyse', exact: true }).click();
  await expect(page.getByRole('switch')).toBeChecked();
  await expect(page.locator('.explanation')).toHaveCount(0);
  expect((await readState(page)).tests).toHaveLength(1);
});
test('combined and changing bookmark collections create independent snapshots, and unfinished tests resume', async ({
  page,
}) => {
  await restore(page);
  await page.getByRole('button', { name: 'Quiz', exact: true }).last().click();
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('button', { name: 'Generate & start' }).click();
  let s = await readState(page);
  expect(s.tests[0].questions).toHaveLength(3);
  expect(s.tests[0].source).toBe('combined');
  const q = s.tests[0].questions[0];
  await page
    .getByRole('group', { name: `Classify ${q.options[0].term}`, exact: true })
    .getByRole('button', { name: 'Synonym', exact: true })
    .click();
  await page.reload();
  await page.getByRole('button', { name: 'Quiz', exact: true }).last().click();
  await page.getByRole('button', { name: 'Resume test' }).click();
  await expect(
    page
      .getByRole('group', { name: `Classify ${q.options[0].term}`, exact: true })
      .getByRole('button', { name: 'Synonym', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Save & exit' }).click();
  await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
  await page.getByRole('button', { name: 'Generate & start' }).click();
  expect((await readState(page)).tests[0].questions).toHaveLength(2);
  await page.getByRole('button', { name: 'Save & exit' }).click();
  await page.getByRole('button', { name: 'Learn', exact: true }).last().click();
  await page
    .getByRole('heading', { name: 'Bright', exact: true })
    .locator('..')
    .getByRole('button', { name: 'Bookmark word' })
    .click();
  await page.getByRole('button', { name: 'Quiz', exact: true }).last().click();
  await page.getByRole('button', { name: 'Generate & start' }).click();
  s = await readState(page);
  expect(s.tests.map((t) => t.questions.length)).toEqual([3, 2, 3]);
});
test('AI completes changed layouts and scans, with resumable imports after quota failure', async ({
  page,
}) => {
  let discovery = 0,
    enrichment = 0,
    quota = true,
    sawImage = false;
  await page.route('https://vocabmaster-test.workers.dev/**', async (route) => {
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
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Backend address').fill('https://vocabmaster-test.workers.dev');
  await page.getByLabel('One-time connection code').fill('b'.repeat(32));
  await page.getByRole('button', { name: 'Connect device' }).click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/unfamiliar-layout.pdf');
  await expect(
    page.getByText('Free daily quota exhausted. Import is saved.', { exact: true }).first(),
  ).toBeVisible();
  expect(discovery).toBe(1);
  expect(Object.keys((await readState(page)).entries)).toHaveLength(2);
  quota = false;
  await page.reload();
  await page.getByRole('button', { name: 'Retry missing information' }).click();
  await expect(page.getByRole('button', { name: 'Retry missing information' })).toHaveCount(0);
  expect(discovery).toBe(1);
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/scanned-slide.pdf');
  await expect(page.getByText('3 words', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry missing information' })).toHaveCount(0);
  expect(sawImage).toBe(true);
  const state = await readState(page);
  expect(Object.keys(state.entries)).toHaveLength(3);
  expect(state.documents.every((d) => d.status === 'ready')).toBe(true);
  expect(enrichment).toBe(3);
  await page.getByRole('button', { name: 'Learn', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Alacrity', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Berserk', exact: true })).toBeVisible();
});
