import { test, expect, type Page } from '@playwright/test';
import { upgradeState } from '../../shared/migrate';
import { emptyState } from '../../shared/types';
import { bankSchema } from '../../shared/monty';
import { review } from './contrast';
const meaning = {
  word: 'resilient',
  partOfSpeech: 'adjective',
  meaningEn: 'Able to recover quickly after difficulty.',
  meaningHi: 'कठिनाइयों से जल्दी उबरने में सक्षम',
  synonyms: ['strong', 'adaptable', 'hardy'],
  antonyms: ['fragile', 'weak', 'vulnerable'],
};
const themes = ['midnight', 'paper', 'slate', 'gold', 'editorial'];
const appearances = [
  ...['amoled', 'black', 'youtube', 'red', 'yellow', 'violet', 'pink', 'teal'].map((color) => ({
    mode: 'dark',
    color,
  })),
  ...['red', 'yellow', 'violet', 'pink', 'teal'].map((color) => ({ mode: 'light', color })),
];
const bank = bankSchema.parse({
  version: 1,
  id: 'qa-bank',
  kind: 'maths',
  questions: [
    {
      id: 'qa-q1',
      number: 1,
      stem: 'Which number is the largest?',
      options: [
        { id: 'a', label: 'A', text: '15' },
        { id: 'b', label: 'B', text: '20' },
        { id: 'c', label: 'C', text: '25' },
        { id: 'd', label: 'D', text: '30' },
      ],
      answerId: 'd',
      page: 1,
      origin: 'pdf',
      explanation: '30 is greater than the other numbers.',
    },
  ],
  study: [
    {
      id: 'qa-study',
      title: 'Comparing numbers',
      text: 'Compare place values from left to right.',
      hindi: 'बाएँ से दाएँ स्थान मान की तुलना करें।',
      page: 1,
    },
  ],
  warnings: [],
});
async function prepare(
  page: Page,
  appearance: { mode: string; color: string },
  readerTheme = 'midnight',
  populated = true,
) {
  await page.addInitScript(
    ({ appearance, readerTheme }) => {
      localStorage.setItem('monty-appearance-v2', JSON.stringify(appearance));
      localStorage.setItem('monty-reader-theme', readerTheme);
    },
    { appearance, readerTheme },
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'What shall we study?' })).toBeVisible();
  const state = upgradeState(emptyState());
  state.reading = {
    articles: populated
      ? {
          'qa-article': {
            id: 'qa-article',
            title: 'The power of small habits',
            createdAt: 1,
            wordCount: 20,
            preview: 'A resilient mind learns to adapt.',
          },
        }
      : {},
    words: populated
      ? {
          resilient: {
            ...meaning,
            id: 'resilient',
            savedAt: 1,
            articleTitle: 'The power of small habits',
            context: 'A resilient mind learns to adapt.',
          },
        }
      : {},
  };
  state.monty!.folders['qa-maths'] = {
    id: 'qa-maths',
    area: 'maths',
    profile: 'maths',
    parentId: null,
    name: 'QA Maths',
    createdAt: 1,
    pinned: true,
  };
  state.monty!.attachments['qa-sheet'] = {
    id: 'qa-sheet',
    folderId: 'qa-maths',
    name: 'Number practice',
    mime: 'application/json',
    kind: 'practice',
    createdAt: 1,
    size: 100,
    pinned: false,
    count: 1,
    status: 'ready',
    bankId: 'qa-bank',
  };
  state.monty!.tests['qa-test'] = {
    id: 'qa-test',
    folderId: 'qa-maths',
    attachmentId: 'qa-sheet',
    bankId: 'qa-bank',
    name: 'Number test',
    source: 'pdf',
    questionIds: ['qa-q1'],
    createdAt: 1,
    selectionNumbers: [1],
    durationMinutes: 15,
  };
  state.monty!.banks['qa-bank'] = { id: 'qa-bank', kind: 'maths', count: 1, studyCount: 1 };
  await page.evaluate(
    async ({ state, bank }) => {
      const open = (name: string, stores: string[]) =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const r = indexedDB.open(name, 1);
          r.onupgradeneeded = () =>
            stores.forEach((s) => {
              if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s);
            });
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
      const db = await open('vocabmaster', ['state', 'pdfs', 'private']);
      const tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').put(state, 'current');
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      const assets = await open('monty-assets', ['files', 'jobs', 'timers']);
      const t = assets.transaction('files', 'readwrite');
      for (const [id, content] of Object.entries({
        'qa-bank': bank,
        'qa-article': {
          blocks: [
            { kind: 'heading', text: 'A daily practice' },
            {
              kind: 'paragraph',
              text: 'A resilient mind learns to adapt. Reading a little every day builds confidence and improves understanding.',
            },
            { kind: 'quote', text: 'Small steps lead to lasting change.' },
          ],
        },
      }))
        t.objectStore('files').put(
          { bytes: new TextEncoder().encode(JSON.stringify(content)), mime: 'application/json' },
          id,
        );
      await new Promise<void>((resolve, reject) => {
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
      assets.close();
    },
    { state, bank },
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'What shall we study?' })).toBeVisible();
}
for (const mode of ['dark', 'light'])
  for (const theme of themes)
    test(`reader ${theme} over ${mode} app`, async ({ page }, info) => {
      await prepare(page, { mode, color: mode === 'dark' ? 'amoled' : 'violet' }, theme, false);
      await page.getByRole('button', { name: 'Article reading' }).click();
      await review(page, info, 'empty-library');
      await page.getByRole('button', { name: 'Add article', exact: true }).click();
      await review(page, info, 'import-dialog');
      const dialog = page.getByRole('dialog', { name: 'Add an article' });
      await dialog.getByLabel('Title', { exact: true }).fill('The power of small habits');
      await dialog.getByLabel('Format', { exact: true }).selectOption('html');
      await dialog
        .getByLabel('Article', { exact: true })
        .fill(
          '<article><h1>The power of small habits</h1><p>A resilient mind learns to adapt. Reading every day builds confidence and improves understanding.</p><blockquote>Keep going.</blockquote></article>',
        );
      await dialog.getByRole('button', { name: 'Save & read' }).click();
      await expect(page.getByRole('heading', { name: 'The power of small habits' })).toBeVisible();
      await review(page, info, 'article');
      await page.route('**/api/process', (route) => route.fulfill({ json: meaning }));
      await page.getByRole('button', { name: 'Look up resilient', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Save word', exact: true })).toBeVisible();
      await review(page, info, 'word-sheet');
      await page.getByRole('button', { name: 'Save word', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Saved to your words' })).toBeVisible();
      await page.getByRole('button', { name: 'Close word lookup' }).click();
      await page.getByRole('button', { name: 'Back to articles' }).click();
      await review(page, info, 'populated-library');
      await page.getByRole('button', { name: /^Saved/ }).click();
      await review(page, info, 'saved-words');
      await page.getByRole('button', { name: 'Back to Monty' }).click();
      await page.getByRole('button', { name: 'Article reading' }).click();
      await expect(page.getByLabel('Reading theme')).toHaveValue(theme);
    });
for (const appearance of appearances)
  test(`workspace ${appearance.mode} ${appearance.color}`, async ({ page }, info) => {
    await prepare(page, appearance);
    await review(page, info, 'home');
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await review(page, info, 'drawer');
    await page
      .getByRole('dialog', { name: 'Menu', exact: true })
      .getByRole('button', { name: 'Settings', exact: true })
      .click();
    await review(page, info, 'settings');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'English', exact: false }).first().click();
    await review(page, info, 'english');
    await page.getByRole('button', { name: 'Grammar', exact: false }).first().click();
    await review(page, info, 'grammar-folders');
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Menu', exact: true })
      .getByRole('button', { name: 'Mathematics', exact: true })
      .click();
    await review(page, info, 'maths-folders');
    await page.getByRole('button', { name: 'QA Maths', exact: false }).first().click();
    await review(page, info, 'maths-sheets');
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await review(page, info, 'notes');
    await page
      .locator('.folder-nav')
      .getByRole('button', { name: 'Practice', exact: true })
      .click();
    await page
      .locator('.document-card')
      .filter({ hasText: 'Number practice' })
      .getByRole('button', { name: 'Practice', exact: true })
      .click();
    await expect(page.getByText('Which number is the largest?', { exact: true })).toBeVisible();
    await review(page, info, 'practice-question');
    await page.getByRole('button', { name: 'Palette', exact: true }).click();
    await review(page, info, 'palette');
    await page.getByRole('button', { name: 'Close question palette' }).click();
    await page.locator('.folder-nav').getByRole('button', { name: 'Tests', exact: true }).click();
    await review(page, info, 'quiz-setup');
    await page.getByRole('button', { name: 'Start test', exact: true }).click();
    await review(page, info, 'timer-dialog');
    await page.getByRole('dialog').getByRole('button', { name: 'Start test', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Exam question' })).toBeVisible();
    await review(page, info, 'exam');
    await page.getByRole('button', { name: 'Submit test', exact: true }).first().click();
    await review(page, info, 'submission-dialog');
    await page.getByRole('button', { name: 'Confirm submission', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Analyse answers' })).toBeVisible();
    await review(page, info, 'result');
    await page.getByRole('button', { name: 'Analyse answers' }).click();
    await review(page, info, 'answer-analysis');
  });
