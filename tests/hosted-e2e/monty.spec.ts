import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { emptyState, type State } from '../../shared/types';
import { upgradeState } from '../../shared/migrate';
import { readFile } from 'node:fs/promises';
async function reset(request: APIRequestContext) {
  const r = await request.get('/api/state'),
    body = await r.json();
  await request.put('/api/state', {
    headers: body.revision ? { 'If-Match': body.revision } : { 'If-None-Match': '*' },
    data: upgradeState(emptyState()),
  });
}
async function local(page: Page): Promise<State> {
  return page.evaluate(async () => {
    const r = indexedDB.open('vocabmaster');
    const db = await new Promise<IDBDatabase>((resolve) => {
      r.onsuccess = () => resolve(r.result);
    });
    return new Promise((resolve) => {
      const q = db.transaction('state').objectStore('state').get('current');
      q.onsuccess = () => resolve(q.result);
    });
  });
}
async function maths(page: Page) {
  await page.getByRole('button', { name: /^Maths Notes/ }).click();
  await page.getByRole('button', { name: /^Percentage/ }).click();
}
const nav = (page: Page, label: string) =>
  page
    .getByRole('navigation', { name: 'Folder navigation' })
    .getByRole('button', { name: label, exact: true });
async function uploadMaths(page: Page) {
  await page.goto('/');
  await maths(page);
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/percentage.pdf');
  await expect(page.getByText('100 questions · ready')).toBeVisible({ timeout: 60000 });
}
test.beforeEach(async ({ request }) => reset(request));
test('home, independent folders and notes upload/download/rename/pin persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'What shall we study?' })).toBeVisible();
  await page.getByRole('button', { name: /^English Grammar/ }).click();
  await page.getByRole('button', { name: 'Grammar', exact: true }).click();
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  await page.getByLabel('Folder name').fill('Tenses');
  await page.getByRole('button', { name: 'Create folder', exact: true }).click();
  await page.getByRole('button', { name: /^Tenses/ }).click();
  await nav(page, 'Notes').click();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/idioms.pdf');
  await expect(page.getByRole('button', { name: /^idioms.pdf/ })).toBeVisible();
  page.once('dialog', (d) => d.accept('Revision notes'));
  await page.getByRole('button', { name: 'Rename idioms.pdf', exact: true }).click();
  await page.getByRole('button', { name: 'Pin Revision notes', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Revision notes/ }).click();
  const pdf = await downloaded;
  expect(pdf.suggestedFilename()).toBe('Revision notes.pdf');
  expect(
    (await readFile((await pdf.path())!)).equals(await readFile('tests/fixtures/idioms.pdf')),
  ).toBe(true);
  await expect(page.locator('.viewer')).toHaveCount(0);
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'What shall we study?' })).toBeVisible();
  const state = await local(page);
  expect(Object.values(state.monty!.folders).find((f) => f.name === 'Tenses')?.area).toBe(
    'grammar',
  );
  expect(Object.values(state.monty!.attachments)[0].pinned).toBe(true);
  expect(Object.values(state.monty!.attachments)[0].name).toBe('Revision notes');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
test('maths imports 100 source questions without AI, immediate feedback and isolated bookmarks', async ({
  page,
}) => {
  let ai = 0;
  await page.route('**/api/extract', (route) => {
    ai++;
    return route.abort();
  });
  await uploadMaths(page);
  const opened = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Open PDF', exact: true }).click();
  const pdf = await opened;
  expect(pdf.suggestedFilename()).toBe('percentage.pdf');
  expect(
    (await readFile((await pdf.path())!)).equals(await readFile('tests/fixtures/percentage.pdf')),
  ).toBe(true);
  await expect(page.locator('.viewer')).toHaveCount(0);
  await page
    .locator('.document-card')
    .getByRole('button', { name: 'Practice', exact: true })
    .click();
  const original = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Original PDF', exact: true }).click();
  expect(
    (await readFile((await (await original).path())!)).equals(
      await readFile('tests/fixtures/percentage.pdf'),
    ),
  ).toBe(true);
  await expect(page.locator('.viewer')).toHaveCount(0);
  await expect(page.getByLabel('Practice question', { exact: true })).toHaveValue('0');
  await page.locator('.mcq-option').nth(1).click();
  await expect(page.getByText('Incorrect', { exact: true })).toBeVisible();
  await expect(page.getByText('Correct answer', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Bookmark practice question' }).click();
  await nav(page, 'Tests').click();
  await expect(page.locator('.pdf-test-group .test-card')).toHaveCount(4);
  await page.getByRole('button', { name: 'Test bookmarks', exact: true }).click();
  await expect(page.getByText('No bookmarks yet')).toBeVisible();
  expect(ai).toBe(0);
  const s = await local(page);
  expect(Object.values(s.monty!.tests).map((t) => t.questionIds.length)).toEqual([25, 25, 25, 25]);
  expect(s.monty!.mathPracticeBookmarks['maths-percentage']).toHaveLength(1);
  expect(s.monty!.mathTestBookmarks['maths-percentage'] ?? []).toHaveLength(0);
});
test('timed maths tests pause, restore question and answers, then expire with analysis timing', async ({
  page,
}) => {
  await page.clock.install();
  await uploadMaths(page);
  await nav(page, 'Tests').click();
  await page.getByRole('button', { name: 'Start test', exact: true }).first().click();
  await expect(page.getByRole('timer')).toHaveText('15:00');
  await page.clock.runFor(6000);
  await page.locator('.mcq-option').first().click();
  await expect(page.getByText('Correct answer', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('.mcq-option').nth(1).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Save & exit' }).click();
  const before = await local(page),
    testId = Object.keys(before.monty!.tests)[0],
    draft = before.monty!.tests[testId].draft!;
  expect(draft.index).toBe(2);
  expect(Object.keys(draft.answers)).toHaveLength(2);
  expect(draft.clock.remainingMs).toBeLessThanOrEqual(894000);
  await page.clock.runFor(60000);
  await page.getByRole('button', { name: 'Resume test', exact: true }).click();
  await expect(page.getByLabel('Test question', { exact: true })).toHaveValue('2');
  await expect(page.getByText('Test paused', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resume timer', exact: true }).click();
  await page.clock.fastForward(900000);
  await expect(page.getByText('Test completed', { exact: true })).toBeVisible();
  const completed = (await local(page)).monty!.tests[testId];
  expect(completed.latest?.correct).toBe(2);
  expect(completed.latest?.unanswered).toBe(23);
  expect(completed.latest?.elapsedMs).toBe(900000);
  await page.getByRole('button', { name: 'Analyse answers' }).click();
  await expect(page.getByText('Time spent on this question:', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Bookmark test question' }).click();
  expect((await local(page)).monty!.mathTestBookmarks['maths-percentage']).toHaveLength(1);
});
test('idioms source cards and meaning quizzes work without AI', async ({ page }) => {
  let ai = 0;
  await page.route('**/api/extract', (route) => {
    ai++;
    return route.abort();
  });
  await page.goto('/');
  await page.getByRole('button', { name: /^English Grammar/ }).click();
  await page.getByRole('button', { name: 'Vocab', exact: true }).click();
  await page.getByRole('button', { name: /^Idioms/ }).click();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/idioms.pdf');
  await expect(page.getByText('30 questions · ready')).toBeVisible();
  await page
    .locator('.document-card')
    .getByRole('button', { name: 'Practice', exact: true })
    .click();
  await expect(page.locator('.word-card')).toHaveCount(30);
  await expect(page.getByRole('heading', { name: 'Yellow press', exact: true })).toBeVisible();
  await page
    .locator('.word-card')
    .first()
    .getByRole('button', { name: 'Bookmark study card' })
    .click();
  await nav(page, 'Bookmarks').click();
  await expect(
    page.getByRole('heading', { name: 'Lend your money and lose your friend', exact: true }),
  ).toBeVisible();
  await nav(page, 'Quiz').click();
  await page.locator('.pdf-check input').check();
  await page.getByRole('button', { name: 'Generate & start' }).click();
  await expect(page.getByRole('timer')).toHaveText('15:00');
  await expect(page.locator('.mcq-option')).toHaveCount(4);
  await expect(page.getByText('Correct answer', { exact: true })).toHaveCount(0);
  expect(ai).toBe(0);
});
test('new grammar folders use the general importer and resume after a quota interruption', async ({
  page,
}) => {
  let quota = true,
    calls = 0;
  await page.route('**/api/extract', (route) => {
    calls++;
    if (quota)
      return route.fulfill({
        status: 429,
        json: { error: 'Free daily quota exhausted. Completed pages are saved.' },
      });
    const data = route.request().postDataJSON(),
      p = data.pages[0];
    return route.fulfill({
      json: {
        study: [{ title: 'Grammar study', text: p.text, hindi: 'अध्ययन', page: p.number }],
        questions: [
          {
            stem: 'Choose the meaning of alacrity.',
            passage: '',
            options: ['Eager readiness', 'Anger', 'Sadness', 'Silence'],
            correctIndex: 0,
            page: p.number,
            evidence: 'Alacrity',
            generated: true,
            explanation: 'Alacrity means eager readiness.',
          },
        ],
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /^English Grammar/ }).click();
  await page.getByRole('button', { name: 'Grammar', exact: true }).click();
  await page.getByRole('button', { name: 'New folder', exact: true }).click();
  await page.getByLabel('Folder name').fill('New topic');
  await page.getByRole('button', { name: 'Create folder' }).click();
  await page.getByRole('button', { name: /^New topic/ }).click();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/unfamiliar-layout.pdf');
  await expect(
    page
      .getByText('Free daily quota exhausted. Completed pages are saved.', { exact: true })
      .first(),
  ).toBeVisible();
  quota = false;
  await page.getByRole('button', { name: 'Resume import', exact: true }).click();
  await expect(page.getByText('1 questions · ready')).toBeVisible();
  expect(calls).toBe(2);
  await page
    .locator('.document-card')
    .getByRole('button', { name: 'Practice', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Grammar study', exact: true })).toBeVisible();
  await nav(page, 'Quiz').click();
  await page.locator('.pdf-check input').check();
  await page.getByRole('button', { name: 'Generate & start' }).click();
  await expect(page.getByText('AI-generated · source page 1')).toBeVisible();
  await page.locator('.mcq-option').first().click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Submit test', exact: true }).click();
  await expect(page.getByText('Test completed', { exact: true })).toBeVisible();
  expect((await local(page)).monty!.tests).toBeTruthy();
});

test('maths resumes the fifth question after a browser reload with its saved timer and first four answers', async ({
  page,
}) => {
  await page.clock.install();
  await uploadMaths(page);
  await nav(page, 'Tests').click();
  await page.getByRole('button', { name: 'Start test', exact: true }).first().click();
  await expect(page.locator('.mcq-option').first()).toBeEnabled();
  await page.clock.fastForward(300000);
  for (let i = 0; i < 4; i++) {
    await page.locator('.mcq-option').first().click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Save & exit' }).click();
  const initial = Object.values((await local(page)).monty!.tests).find((t) => t.draft)!;
  const remaining = initial.draft!.clock.remainingMs;
  expect(remaining).toBeGreaterThan(595000);
  expect(remaining).toBeLessThanOrEqual(600000);
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible();
  await page.reload();
  await maths(page);
  await nav(page, 'Tests').click();
  await page.getByRole('button', { name: 'Resume test', exact: true }).click();
  await expect(page.getByLabel('Test question', { exact: true })).toHaveValue('4');
  await expect(page.getByText('Test paused', { exact: true })).toBeVisible();
  const restored = (await local(page)).monty!.tests[initial.id].draft!;
  expect(Object.keys(restored.answers)).toHaveLength(4);
  expect(Math.abs(restored.clock.remainingMs - remaining)).toBeLessThan(1000);
});
test('a 60-page maths PDF produces all questions and remainder tests on mobile', async ({
  page,
}) => {
  await page.goto('/');
  await maths(page);
  let errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/large-60-pages.pdf');
  await expect(page.getByText('59 questions · ready')).toBeVisible({ timeout: 60000 });
  await nav(page, 'Tests').click();
  const tests = Object.values((await local(page)).monty!.tests);
  expect(tests.map((t) => t.questionIds.length)).toEqual([25, 25, 9]);
  expect(new Set(tests.flatMap((t) => t.questionIds)).size).toBe(59);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
test('a complete Monty ZIP restores notes, question banks and paused test answers', async ({
  page,
  request,
}) => {
  await uploadMaths(page);
  await nav(page, 'Notes').click();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/idioms.pdf');
  await nav(page, 'Tests').click();
  await page.getByRole('button', { name: 'Start test', exact: true }).first().click();
  await page.locator('.mcq-option').first().click();
  await page.getByRole('button', { name: 'Save & exit' }).click();
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible();
  const before = await local(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  const saved = await download;
  const path = await saved.path();
  expect(path).toBeTruthy();
  await reset(request);
  page.once('dialog', (d) => d.accept());
  await page.locator('input[type=file]').setInputFiles(path!);
  await expect(page.getByText('Backup restored.', { exact: true })).toBeVisible();
  await expect(page.getByText('Saved online', { exact: true }).first()).toBeVisible();
  const after = await local(page);
  expect(Object.keys(after.monty!.attachments)).toHaveLength(2);
  expect(Object.keys(after.monty!.tests)).toEqual(Object.keys(before.monty!.tests));
  const paused = Object.values(after.monty!.tests).find((t) => t.draft)!;
  expect(Object.keys(paused.draft!.answers)).toHaveLength(1);
  const remote = (await (await request.get('/api/state')).json()).state;
  expect(Object.keys(remote.monty.tests)).toHaveLength(4);
});
test('maths English/source display keeps the original bilingual question and options intact', async ({
  page,
}) => {
  await uploadMaths(page);
  await page
    .locator('.document-card')
    .getByRole('button', { name: 'Practice', exact: true })
    .click();
  await expect(page.locator('.question-stem')).toBeVisible();
  expect(await page.locator('.question-stem').innerText()).not.toMatch(/[\u0900-\u097f]/);
  await expect(page.locator('.fraction').first()).toBeVisible();
  expect(await page.locator('.mcq-option').nth(3).innerText()).not.toContain('/');
  await page.getByRole('button', { name: 'Source text', exact: true }).click();
  expect(await page.locator('.question-stem').innerText()).toMatch(/[\u0900-\u097f]/);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  expect(await page.locator('.question-stem').innerText()).not.toMatch(/[\u0900-\u097f]/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('topic folders allow only one level in Grammar, Vocab, reading and Maths', async ({
  page,
}) => {
  await page.goto('/');
  for (const area of ['Grammar', 'Vocab', 'PQRS / RS / CT / RC', 'Maths']) {
    await page.getByRole('button', { name: 'Monty home', exact: true }).click();
    if (area === 'Maths') await page.getByRole('button', { name: /^Maths Notes/ }).click();
    else {
      await page.getByRole('button', { name: /^English Grammar/ }).click();
      await page.getByRole('button', { name: area, exact: true }).click();
    }
    await page.getByRole('button', { name: 'New folder', exact: true }).click();
    await page.getByLabel('Folder name').fill('Topic one');
    await page.getByRole('button', { name: 'Create folder', exact: true }).click();
    await page.getByRole('button', { name: /^Topic one/ }).click();
    await expect(page.locator('.breadcrumbs')).toContainText('Topic one');
    await expect(page.getByRole('button', { name: 'New folder', exact: true })).toHaveCount(0);
    await expect(page.getByText('Subfolders', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Folders', exact: true }).click();
    await expect(page.getByRole('button', { name: 'New folder', exact: true })).toBeVisible();
  }
});

test('Anto/Syno and Idioms share paths, PDF actions and tab order; vocabulary changes persist', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^English Grammar/ }).click();
  await page.getByRole('button', { name: 'Vocab', exact: true }).click();
  await page.getByRole('button', { name: /^Anto \/ Syno/ }).click();
  await expect(page.locator('.breadcrumbs')).toHaveText('Home/English/Vocab/Anto / Syno');
  await expect(page.getByRole('button', { name: 'New folder', exact: true })).toHaveCount(0);
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/4-LEC-2-CONCISE.pdf');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
  await expect(page.locator('.document-card')).toHaveCount(1);
  await expect(
    page.locator('.document-card').getByRole('button', { name: 'Practice', exact: true }),
  ).toBeEnabled();
  const tabs = await page
    .getByRole('navigation', { name: 'Folder navigation' })
    .getByRole('button')
    .allTextContents();
  expect(tabs).toEqual(['Notes', 'Practice', 'Quiz', 'Bookmarks', 'Results']);
  const actions = await page.locator('.document-actions').getByRole('button').allTextContents();
  expect(actions).toEqual(['Practice', 'Open PDF', 'Review / edit']);
  const downloaded = page.waitForEvent('download');
  await page
    .locator('.document-card')
    .getByRole('button', { name: 'Open PDF', exact: true })
    .click();
  const pdf = await downloaded;
  expect(pdf.suggestedFilename()).toBe('4-LEC-2-CONCISE.pdf');
  expect(
    (await readFile((await pdf.path())!)).equals(
      await readFile('tests/fixtures/4-LEC-2-CONCISE.pdf'),
    ),
  ).toBe(true);
  await expect(page.locator('.viewer')).toHaveCount(0);
  page.once('dialog', (d) => d.accept('Renamed vocabulary'));
  await page.getByRole('button', { name: /^Rename 4-LEC/ }).click();
  await page.getByRole('button', { name: 'Pin Renamed vocabulary', exact: true }).click();
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /^English Grammar/ }).click();
  await page.getByRole('button', { name: 'Vocab', exact: true }).click();
  await page.getByRole('button', { name: /^Anto \/ Syno/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Renamed vocabulary', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Unpin Renamed vocabulary', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Folders', exact: true }).click();
  await page.getByRole('button', { name: /^Idioms/ }).click();
  await expect(page.locator('.breadcrumbs')).toHaveText('Home/English/Vocab/Idioms');
  await expect(page.getByRole('button', { name: 'New folder', exact: true })).toHaveCount(0);
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/idioms.pdf');
  await expect(page.getByText('30 questions · ready')).toBeVisible();
  expect(await page.locator('.document-actions').getByRole('button').allTextContents()).toEqual(
    actions,
  );
  expect(
    await page
      .getByRole('navigation', { name: 'Folder navigation' })
      .getByRole('button')
      .allTextContents(),
  ).toEqual(tabs);
  const footer = await page.getByRole('navigation', { name: 'Folder navigation' }).boundingBox();
  expect(footer!.y + footer!.height).toBeGreaterThan((await page.evaluate(() => innerHeight)) - 32);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('55 MB notes upload, cloud download and restore in a fresh browser', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120000);
  const { writeFile, readFile } = await import('node:fs/promises');
  const bytes = Buffer.alloc(55_000_000, 32);
  const pdf = await readFile('tests/fixtures/idioms.pdf');
  pdf.copy(bytes);
  pdf.subarray(-1024).copy(bytes, bytes.length - 1024);
  const path = testInfo.outputPath('large-notes.pdf');
  await writeFile(path, bytes);
  await page.goto('/');
  await maths(page);
  await nav(page, 'Notes').click();
  await page.locator('input[type=file]').setInputFiles(path);
  await expect(page.getByRole('button', { name: /^large-notes.pdf/ })).toBeVisible();
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible({ timeout: 90000 });
  const file = Object.values((await local(page)).monty!.attachments)[0];
  expect(file.size).toBe(bytes.length);
  const context = await browser.newContext({
    viewport: { width: 393, height: 851 },
    isMobile: true,
  });
  try {
    const fresh = await context.newPage();
    await fresh.goto('http://127.0.0.1:5180');
    await maths(fresh);
    await nav(fresh, 'Notes').click();
    await expect(fresh.getByRole('button', { name: /^large-notes.pdf/ })).toBeVisible();
    const download = await fresh.request.get('http://127.0.0.1:5180/api/files/' + file.id);
    expect(download.ok()).toBe(true);
    expect((await download.body()).equals(bytes)).toBe(true);
    const downloaded = fresh.waitForEvent('download');
    await fresh.getByRole('button', { name: /^large-notes.pdf/ }).click();
    const pdfDownload = await downloaded;
    expect(pdfDownload.suggestedFilename()).toBe('large-notes.pdf');
    expect((await readFile((await pdfDownload.path())!)).equals(bytes)).toBe(true);
    await expect(fresh.locator('.viewer')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('500 MB notes save in parts, resume interrupted uploads and download completely', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180000);
  const { open } = await import('node:fs/promises');
  const size = 500_000_000,
    path = testInfo.outputPath('500-mb-notes.pdf');
  const file = await open(path, 'w');
  await file.write(new TextEncoder().encode('%PDF-1.7\n'));
  await file.truncate(size);
  await file.close();
  let blocked = true,
    firstParts = 0;
  await page.route('**/api/files/*?upload=part*', async (route) => {
    const part = new URL(route.request().url()).searchParams.get('part');
    if (part === '1') firstParts++;
    if (part === '2' && blocked)
      return route.fulfill({ status: 503, json: { error: 'Temporary network interruption' } });
    await route.continue();
  });
  await page.goto('/');
  await maths(page);
  await nav(page, 'Notes').click();
  await page.locator('input[type=file]').setInputFiles(path);
  await expect(page.getByRole('button', { name: /^500-mb-notes.pdf/ })).toBeVisible();
  await expect(
    page.getByText('Saved on phone · online backup pending', { exact: true }),
  ).toBeVisible();
  blocked = false;
  await page.reload();
  await maths(page);
  await nav(page, 'Notes').click();
  await expect(page.getByText('Saved online', { exact: true })).toBeVisible({ timeout: 120000 });
  expect(firstParts).toBe(1);
  const record = Object.values((await local(page)).monty!.attachments)[0];
  expect(record.size).toBe(size);
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5180',
    viewport: { width: 393, height: 851 },
    isMobile: true,
  });
  try {
    const fresh = await context.newPage();
    await fresh.goto('/');
    await maths(fresh);
    await nav(fresh, 'Notes').click();
    await expect(fresh.getByRole('button', { name: /^500-mb-notes.pdf/ })).toBeVisible();
    const downloaded = await fresh.evaluate(async (id) => {
      const response = await fetch('/api/files/' + id);
      if (!response.ok) throw Error('Download failed');
      const reader = response.body!.getReader();
      let total = 0,
        prefix = '';
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (!total) prefix = new TextDecoder().decode(chunk.value.subarray(0, 8));
        total += chunk.value.byteLength;
      }
      return { total, prefix };
    }, record.id);
    expect(downloaded).toEqual({ total: size, prefix: '%PDF-1.7' });
  } finally {
    await context.close();
  }
});
