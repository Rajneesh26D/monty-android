import { test, expect, type Page } from '@playwright/test';
import { upgradeState } from '../../shared/migrate';
import { emptyState } from '../../shared/types';
import { bankSchema } from '../../shared/monty';
import { blankEntry } from '../../src/core/vocabulary';
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
  vocabularySheets = false,
) {
  await page.addInitScript(
    ({ appearance, readerTheme }) => {
      if (!localStorage.getItem('monty-appearance-v2'))
        localStorage.setItem('monty-appearance-v2', JSON.stringify(appearance));
      if (!localStorage.getItem('monty-reader-theme'))
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
  if (vocabularySheets)
    for (let sheet = 1; sheet <= 3; sheet++) {
      const doc = {
        id: `sheet-${sheet}`,
        name: `Vocabulary sheet ${sheet}`,
        hash: `sheet-${sheet}`,
        entryIds: [] as string[],
        pendingPages: [],
        status: 'ready' as const,
        createdAt: sheet,
        parserVersion: 3,
      };
      for (let number = 1; number <= 30; number++) {
        const entry = {
          ...blankEntry(`Term ${sheet}.${number}`),
          meaningEn: 'Definition',
          synonyms: [{ term: 'Similar', explanation: '' }],
          antonyms: [{ term: 'Opposite', explanation: '' }],
        };
        state.entries[entry.id] = entry;
        doc.entryIds.push(entry.id);
      }
      state.documents.push(doc);
    }
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
      const dialog = page.locator('dialog.reader-import[open]');
      await expect(
        dialog.getByRole('heading', { name: 'Add an article', exact: true }),
      ).toBeVisible();
      await dialog.getByLabel('Title', { exact: true }).fill('The power of small habits');
      await dialog.getByRole('combobox', { name: 'Format', exact: true }).selectOption('html');
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

test('English quizzes list new tests and run a combined range with no countdown', async ({
  page,
}, info) => {
  await prepare(page, { mode: 'light', color: 'violet' }, 'paper', true, true);
  await page.getByRole('button', { name: 'English', exact: false }).first().click();
  await page.getByRole('button', { name: 'Vocab', exact: true }).first().click();
  await page.getByRole('button', { name: /^Anto \/ Syno/ }).click();
  await page.getByRole('button', { name: 'Quiz', exact: true }).click();
  await page.getByRole('checkbox', { name: /Vocabulary sheet 1/ }).check();
  await page.getByRole('checkbox', { name: /Vocabulary sheet 3/ }).check();
  await expect(page.getByText(/60 questions available/)).toBeVisible();
  await page.getByLabel('Choose questions').fill('30 to 31');
  await page.getByRole('button', { name: 'Create test', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'No timer' }).click();
  await dialog.getByRole('button', { name: 'Create test', exact: true }).click();
  const saved = page.getByRole('region', { name: 'Saved tests' });
  await expect(saved.getByText('2 questions · Untimed', { exact: false })).toBeVisible();
  await saved.getByRole('button', { name: 'Start test', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'No timer' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await dialog.getByRole('button', { name: 'Start test', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Exam question' })).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(0);
  await expect(page.getByText('Term 1.30', { exact: true })).toBeVisible();
  const choice = page.getByRole('group', { name: 'Classify Similar' });
  await choice.getByRole('button', { name: 'Synonym', exact: true }).click();
  await page.getByRole('button', { name: 'Clear Response', exact: true }).click();
  await expect(choice.getByRole('button', { name: 'Synonym', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await choice.getByRole('button', { name: 'Synonym', exact: true }).click();
  await page.getByRole('button', { name: 'Mark for Review & Next', exact: true }).click();
  await expect(page.getByText('Term 3.1', { exact: true })).toBeVisible();
  await review(page, info, 'untimed-vocabulary-exam');
  await page.getByRole('button', { name: 'Submit test', exact: true }).first().click();
  await page.getByRole('button', { name: 'Confirm submission', exact: true }).click();
  await expect(page.getByText('Test completed', { exact: true })).toBeVisible();
  await review(page, info, 'vocabulary-result');
  await page.getByRole('button', { name: 'Analyse answers' }).click();
  await review(page, info, 'vocabulary-analysis');
  await page.locator('.analysis').getByRole('button', { name: 'Results', exact: true }).click();
  await page.getByRole('button', { name: 'Reattempt test' }).click();
  await dialog.getByRole('checkbox', { name: 'Shuffle answer options' }).check();
  await dialog.getByRole('button', { name: '5 min', exact: true }).click();
  await dialog.getByRole('button', { name: 'Start reattempt' }).click();
  await expect(page.getByRole('timer')).toBeVisible();
});

test('red and AMOLED presets stay selected across navigation and reload', async ({
  page,
}, info) => {
  await prepare(page, { mode: 'dark', color: 'amoled' });
  const settings = async () => {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Menu', exact: true })
      .getByRole('button', { name: 'Settings', exact: true })
      .click();
  };
  await settings();
  await page.getByRole('button', { name: 'Red light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'red');
  await review(page, info, 'red-light-appearance');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('button', { name: /Switch to (light|dark) theme/ })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'red');
  await settings();
  await expect(page.getByRole('button', { name: 'Red light', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'AMOLED dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'amoled');
  await review(page, info, 'amoled-appearance');
});
