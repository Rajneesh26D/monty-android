import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { emptyState, type State } from '../../shared/types';
import { upgradeState } from '../../shared/migrate';
import { blankEntry } from '../../src/core/vocabulary';
import { createTest, startAttempt } from '../../src/core/quiz';
import { openVocab } from './navigation';

async function seed(request: APIRequestContext, state = upgradeState(emptyState())) {
  const current = await (await request.get('/api/state')).json();
  expect(
    (
      await request.put('/api/state', {
        headers: current.revision ? { 'If-Match': current.revision } : { 'If-None-Match': '*' },
        data: state,
      })
    ).ok(),
  ).toBe(true);
}
async function local(page: Page): Promise<State> {
  return page.evaluate(async () => {
    const id = document.getElementById('monty-offline-data')?.getAttribute('data-library');
    const req = indexedDB.open(id ? 'monty-offline-' + id : 'vocabmaster');
    const db = await new Promise<IDBDatabase>((ok) => {
      req.onsuccess = () => ok(req.result);
    });
    return new Promise((ok) => {
      const r = db.transaction('state').objectStore('state').get('current');
      r.onsuccess = () => {
        db.close();
        ok(r.result);
      };
    });
  });
}
async function maths(page: Page) {
  await page.getByRole('button', { name: /^Maths Notes/ }).click();
  await page.getByRole('button', { name: /^Percentage/ }).click();
}
const nav = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Folder navigation' })
    .getByRole('button', { name, exact: true });
async function upload(page: Page) {
  await page.goto('/');
  await maths(page);
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/percentage.pdf');
  await expect(page.getByText('100 questions · ready')).toBeVisible();
}
async function practice(page: Page) {
  await page
    .locator('.document-card')
    .getByRole('button', { name: 'Practice', exact: true })
    .click();
  await expect(page.getByLabel('Practice question', { exact: true })).toBeVisible();
}
async function showPalette(page: Page) {
  if (!(await page.getByRole('dialog', { name: 'Question palette', exact: true }).isVisible()))
    await page.getByRole('button', { name: 'Palette', exact: true }).click();
}
async function expectAnswered(page: Page, text: string) {
  await showPalette(page);
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close question palette', exact: true }).click();
}
test.beforeEach(async ({ request }) => seed(request));

test('Maths practice resumes at 31, retains choices, counts only answers and restores on another phone', async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await upload(page);
  await practice(page);
  for (let i = 0; i < 30; i++) {
    await page
      .locator('.mcq-option')
      .nth(i % 4)
      .click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await expectAnswered(page, '30 / 100 answered');
  await page.getByLabel('Practice question', { exact: true }).selectOption({ value: '39' });
  await expectAnswered(page, '30 / 100 answered');
  await expect(page.getByRole('button', { name: 'Mark for review', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Submit test', exact: true })).toHaveCount(0);
  await expect(
    page.locator('.app-header .cloud-status').getByText('Saved online', { exact: true }),
  ).toBeVisible();
  const before = await local(page);
  const id = Object.keys(before.monty!.practice)[0];
  expect(Object.keys(before.monty!.practice[id].answers)).toHaveLength(30);
  await page.reload();
  await maths(page);
  await practice(page);
  await expect(page.getByLabel('Practice question', { exact: true })).toHaveValue('30');
  await showPalette(page);
  await expect(
    page.getByRole('button', { name: 'Question 1, answered', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Question 1, answered', exact: true }).click();
  await expect(page.locator('.mcq-option').first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Try this question again', exact: true }).click();
  await expectAnswered(page, '29 / 100 answered');
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible();
  const context = await browser.newContext({
    viewport: { width: 393, height: 851 },
    isMobile: true,
  });
  try {
    const other = await context.newPage();
    await other.goto('http://127.0.0.1:5180');
    await maths(other);
    await practice(other);
    await expect(other.getByLabel('Practice question', { exact: true })).toHaveValue('0');
    await expectAnswered(other, '29 / 100 answered');
    await other.getByLabel('Practice question', { exact: true }).selectOption({ value: '1' });
    await expect(other.locator('.mcq-option').nth(1)).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await context.close();
  }
});

test('Maths quiz saves review flags, visited palette, clear, navigation and early submission', async ({
  page,
}, info) => {
  await upload(page);
  await nav(page, 'Tests').click();
  await page.getByRole('button', { name: 'Start test', exact: true }).first().click();
  await expect(page.locator('.mcq-option').first()).toBeEnabled();
  await page.locator('.mcq-option').first().click();
  await page.getByRole('button', { name: 'Mark for review', exact: true }).click();
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('.mcq-option').first().click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Mark for review', exact: true }).click();
  await showPalette(page);
  await expect(
    page.getByRole('button', { name: 'Question 1, answered, marked for review', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Question 2, not answered', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Question 5, not visited', exact: true }).click();
  await expectAnswered(page, '1 / 25 answered');
  expect(await page.locator('.answer-note').count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await expect(page.getByText('1 / 25 answered', { exact: true })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Palette', exact: true })).toBeInViewport();
  await page
    .locator('main')
    .evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
  const controls = (await page
    .getByRole('button', { name: 'Submit test', exact: true })
    .boundingBox())!;
  const dock = (await page.locator('.question-palette-dock').boundingBox())!;
  expect(controls.y + controls.height).toBeLessThanOrEqual(dock.y);
  await page.screenshot({ path: info.outputPath('maths-quiz.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save & exit', exact: true }).click();
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible();
  await page.reload();
  await maths(page);
  await nav(page, 'Tests').click();
  await page.getByRole('button', { name: 'Resume test', exact: true }).click();
  await expect(page.getByLabel('Test question', { exact: true })).toHaveValue('4');
  await showPalette(page);
  await expect(
    page.getByRole('button', { name: 'Question 3, not answered, marked for review', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close question palette', exact: true }).click();
  await page.getByRole('button', { name: 'Resume timer', exact: true }).click();
  page.once('dialog', (d) => {
    expect(d.message()).toContain('1 answered, 24 unanswered, 2 marked');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Submit test', exact: true }).click();
  await expect(page.getByText('Test completed', { exact: true })).toBeVisible();
  expect(
    Object.values((await local(page)).monty!.tests).find((t) => t.latest)!.latest!.unanswered,
  ).toBe(24);
});

test('English vocabulary uses the same exam controls with partial answers, flags and clear', async ({
  page,
  request,
}) => {
  const s = upgradeState(emptyState());
  const entries = ['Calm', 'Brave', 'Quick'].map((word) => ({
    ...blankEntry(word),
    meaningEn: 'A source meaning',
    synonyms: [{ term: 'Similar', explanation: '' }],
    antonyms: [{ term: 'Opposite', explanation: '' }],
  }));
  for (const e of entries) s.entries[e.id] = e;
  s.tests = [startAttempt(createTest(entries, 'Vocabulary test', 'pdf', [], 0))];
  await seed(request, s);
  await page.goto('/');
  await openVocab(page);
  await nav(page, 'Quiz').click();
  await page.getByRole('button', { name: 'Resume test', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Synonym', exact: true }).first()).toBeEnabled();
  await page.getByRole('button', { name: 'Synonym', exact: true }).first().click();
  await expectAnswered(page, '0 / 3 answered');
  await page.getByRole('button', { name: 'Mark for review', exact: true }).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  const q = (await local(page)).tests[0].questions[0];
  for (const o of q.options)
    await page
      .getByRole('group', { name: `Classify ${o.term}`, exact: true })
      .getByRole('button', { name: o.kind === 'syn' ? 'Synonym' : 'Antonym', exact: true })
      .click();
  await expectAnswered(page, '1 / 3 answered');
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(page.getByLabel('Test question', { exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: 'Save & exit', exact: true }).click();
  await page.getByRole('button', { name: 'Resume test', exact: true }).click();
  await showPalette(page);
  await expect(
    page.getByRole('button', { name: 'Question 1, answered, marked for review', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close question palette', exact: true }).click();
  await page.getByRole('button', { name: 'Resume timer', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Submit test', exact: true }).click();
  await expect(page.locator('.score')).toHaveText('1/3');
});

test('downloaded offline Monty runs its library and saves progress with all networking disabled', async ({
  page,
  browser,
}, info) => {
  await upload(page);
  await practice(page);
  await page.locator('.mcq-option').first().click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download offline Monty', exact: true }).click();
  const download = await downloading;
  const path = info.outputPath('Monty-offline.html');
  await download.saveAs(path);
  expect((await readFile(path, 'utf8')).includes('monty-offline-data')).toBe(true);
  const context = await browser.newContext({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    offline: true,
  });
  try {
    const offline = await context.newPage();
    const errors: string[] = [],
      requests: string[] = [];
    offline.on('pageerror', (e) => errors.push(e.message));
    offline.on('request', (r) => {
      if (/^https?:/.test(r.url()) && !r.url().endsWith('/offline-check.html'))
        requests.push(r.url());
    });
    const offlineURL = 'http://127.0.0.1:5180/offline-check.html';
    await context.route(offlineURL, async (route) =>
      route.fulfill({ contentType: 'text/html', body: await readFile(path, 'utf8') }),
    );
    await offline.goto(offlineURL);
    await expect(
      offline.getByText('Offline copy · saved on device', { exact: true }),
    ).toBeVisible();
    await maths(offline);
    await practice(offline);
    await expect(offline.getByLabel('Practice question', { exact: true })).toHaveValue('1');
    await expectAnswered(offline, '1 / 100 answered');
    await offline.locator('.mcq-option').nth(1).click();
    await offline.reload();
    await maths(offline);
    await practice(offline);
    await expect(offline.getByLabel('Practice question', { exact: true })).toHaveValue('2');
    await expectAnswered(offline, '2 / 100 answered');
    await offline.getByLabel('Practice question', { exact: true }).selectOption({ value: '0' });
    await expect(offline.locator('.mcq-option').first()).toHaveAttribute('aria-pressed', 'true');
    const original = offline.waitForEvent('download');
    await offline.getByRole('button', { name: 'Original PDF', exact: true }).click();
    expect(
      (await readFile((await (await original).path())!)).equals(
        await readFile('tests/fixtures/percentage.pdf'),
      ),
    ).toBe(true);
    await nav(offline, 'Tests').click();
    await offline.getByRole('button', { name: 'Start test', exact: true }).first().click();
    await expect(offline.locator('.mcq-option').first()).toBeEnabled();
    await offline.locator('.mcq-option').first().click();
    await offline.getByRole('button', { name: 'Mark for review', exact: true }).click();
    await offline.getByRole('button', { name: 'Save & next', exact: true }).click();
    await offline.getByRole('button', { name: 'Save & exit', exact: true }).click();
    await offline.reload();
    await maths(offline);
    await nav(offline, 'Tests').click();
    await offline.getByRole('button', { name: 'Resume test', exact: true }).click();
    await expect(offline.getByLabel('Test question', { exact: true })).toHaveValue('1');
    await showPalette(offline);
    await expect(
      offline.getByRole('button', { name: 'Question 1, answered, marked for review', exact: true }),
    ).toBeVisible();
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('Palette stays out of the reading area, opens at any scroll position and closes after a jump', async ({
  page,
}, info) => {
  await upload(page);
  await practice(page);
  const palette = page.getByRole('dialog', { name: 'Question palette', exact: true });
  const launcher = page.getByRole('button', { name: 'Palette', exact: true });
  await expect(palette).not.toBeVisible();
  await expect(page.getByText('0 / 100 answered', { exact: true })).not.toBeVisible();
  await expect(page.locator('.tracker-counts')).not.toBeVisible();
  await page.getByLabel('Practice question', { exact: true }).selectOption({ value: '4' });
  await page.locator('main').evaluate((el) => el.scrollTo({ top: 250, behavior: 'instant' }));
  const readingPosition = await page.locator('main').evaluate((el) => el.scrollTop);
  await expect(launcher).toBeInViewport();
  await page.screenshot({ path: info.outputPath('practice-palette-closed.png') });
  await launcher.click();
  await expect(palette).toBeVisible();
  await expect(page.getByText('0 / 100 answered', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close question palette' })).toBeFocused();
  await page.screenshot({ path: info.outputPath('practice-palette-open.png') });
  await page.keyboard.press('Escape');
  await expect(palette).not.toBeVisible();
  await expect(launcher).toBeFocused();
  expect(await page.locator('main').evaluate((el) => el.scrollTop)).toBe(readingPosition);
  await launcher.click();
  await page.mouse.click(5, 80);
  await expect(palette).not.toBeVisible();
  expect(await page.locator('main').evaluate((el) => el.scrollTop)).toBe(readingPosition);
  await launcher.click();
  await page.getByRole('button', { name: 'Question 100, not visited', exact: true }).click();
  await expect(palette).not.toBeVisible();
  await expect(page.getByLabel('Practice question', { exact: true })).toHaveValue('99');
  await expect(page.getByText('0 / 100 answered', { exact: true })).not.toBeVisible();
  await page
    .locator('main')
    .evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
  await expect(launcher).toBeInViewport();
  const launchBox = (await launcher.boundingBox())!;
  const navBox = (await page.getByRole('navigation', { name: 'Folder navigation' }).boundingBox())!;
  expect(launchBox.y).toBeGreaterThanOrEqual(navBox.y);
  expect(launchBox.y + launchBox.height).toBeLessThanOrEqual(navBox.y + navBox.height);
  const previousBox = (await page
    .getByRole('button', { name: 'Previous', exact: true })
    .boundingBox())!;
  expect(previousBox.y + previousBox.height).toBeLessThanOrEqual(navBox.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.setViewportSize({ width: 1280, height: 800 });
  await launcher.click();
  await expect(palette).toBeInViewport();
  const panelBox = (await palette.boundingBox())!;
  expect(panelBox.width).toBeLessThanOrEqual(640);
  expect(panelBox.x).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Close question palette' }).click();
});
