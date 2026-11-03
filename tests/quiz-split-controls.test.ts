import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { upgradeState } from '../shared/migrate';
import { emptyState } from '../shared/types';
import { QuizSplitControls } from '../src/components/QuizSplitControls';

vi.mock('../src/pdf/reader', () => ({ openPdf: vi.fn() }));

// Enter the quiz tab when server-rendering the real section components.
// Effects stay disabled: no personal library, network or browser is needed.
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>();
  return {
    ...react,
    useState: (initial: unknown) =>
      react.useState(initial === 'practice' || initial === 'library' ? 'quiz' : initial),
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  };
});
import { StudyFolder } from '../src/components/StudyFolder';
import VocabApp from '../src/App';

it.each(['maths', 'grammar', 'reading', 'vocab'] as const)(
  'renders split controls in the actual %s quiz screen with one available PDF',
  (area) => {
    const state = upgradeState(emptyState());
    const folder = {
      id: area,
      parentId: null,
      area,
      name: area,
      profile: 'auto' as const,
      pinned: false,
      createdAt: 1,
    };
    state.monty!.folders[area] = folder;
    state.monty!.attachments.pdf = {
      id: 'pdf',
      folderId: area,
      name: 'Single PDF',
      mime: 'application/pdf',
      size: 10,
      pinned: false,
      kind: 'practice',
      createdAt: 1,
      bankId: 'bank',
      count: 100,
      status: 'ready',
    };
    const html = renderToStaticMarkup(
      createElement(StudyFolder, {
        state,
        folder,
        current: () => state,
        commit: vi.fn(),
        notify: vi.fn(),
        onBack: vi.fn(),
        onHome: vi.fn(),
      }),
    );
    expect(html).toContain('aria-label="Split tests"');
    expect(html).toContain('Custom number of quizzes');
    expect(html).toContain('Single PDF');
  },
);

it('renders split controls in the separate synonym/antonym vocabulary screen with a single PDF', () => {
  const state = upgradeState(emptyState());
  state.documents = [
    {
      id: 'pdf',
      name: 'Single PDF',
      hash: 'hash',
      createdAt: 1,
      entryIds: [],
      status: 'ready',
      pendingPages: [],
    },
  ];
  const store = { state, current: () => state, commit: vi.fn(), error: '' } as any;
  const html = renderToStaticMarkup(
    createElement(VocabApp, {
      store,
      folderName: 'Vocabulary',
      renderNotes: () => null,
      navigation: null,
      onBack: vi.fn(),
      onHome: vi.fn(),
      onSettings: vi.fn(),
    }),
  );
  expect(html).toContain('aria-label="Split tests"');
  expect(html).toContain('Custom number of quizzes');
});

it('renders the same split controls in an Idioms folder', () => {
  const state = upgradeState(emptyState());
  const folder = state.monty!.folders['english-vocab-idioms'];
  const html = renderToStaticMarkup(
    createElement(StudyFolder, {
      state,
      folder,
      current: () => state,
      commit: vi.fn(),
      notify: vi.fn(),
      onBack: vi.fn(),
      onHome: vi.fn(),
    }),
  );
  expect(html).toContain('aria-label="Split tests"');
  expect(html).toContain('Custom number of quizzes');
});

it('previews four groups of 25 and accepts custom counts beyond five', () => {
  const four = renderToStaticMarkup(
    createElement(QuizSplitControls, { total: 100, parts: 4, onChange: vi.fn() }),
  );
  expect(four).toContain('25 + 25 + 25 + 25 questions · 4 separate results');
  const ten = renderToStaticMarkup(
    createElement(QuizSplitControls, { total: 100, parts: 10, onChange: vi.fn() }),
  );
  expect(ten).toContain('Number of quizzes');
  expect(ten).toContain('value="10"');
  expect(ten).toContain('10 separate results');
});
