import { expect, it, vi, beforeEach } from 'vitest';
import { emptyState } from '../shared/types';
import { upgradeState } from '../shared/migrate';
import { linesOf, type PageData } from '../src/pdf/parser';
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  readJob: vi.fn(),
  saveJob: vi.fn(),
  state: vi.fn(),
  pdf: vi.fn(),
  extract: vi.fn(),
  general: vi.fn(),
}));
vi.mock('../src/storage/repository', () => ({
  readAttachment: mocks.read,
  saveAttachment: mocks.save,
  readJob: mocks.readJob,
  saveJob: mocks.saveJob,
  readStoredState: mocks.state,
}));
vi.mock('../src/pdf/reader', () => ({ openPdf: mocks.pdf }));
vi.mock('../src/services/api', () => ({
  extractGeneral: mocks.general,
  extractMaths: mocks.extract,
}));
const make = (number: number, lines: string[]): PageData => {
  const items = lines.map((text, i) => ({
    text,
    x: 40,
    y: 60 + i * 15,
    width: 200,
    height: 12,
    fontName: 'body',
  }));
  return {
    number,
    width: 600,
    height: 800,
    items,
    text: linesOf(items).join('\n'),
    hasVisualContent: false,
  };
};
const key = make(2, ['Answers', '1. Ans-1', '2. Ans-3', '3. Ans-b']);
let state = upgradeState(emptyState());
let jobs = new Map(),
  banks = new Map();
const folder = {
  id: 'grammar',
  name: 'Grammar',
  area: 'grammar' as const,
  parentId: null,
  pinned: false,
  profile: 'auto' as const,
  createdAt: 0,
};
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  jobs = new Map();
  banks = new Map();
  state = upgradeState(emptyState());
  state.monty!.folders[folder.id] = folder;
  state.monty!.attachments.source = {
    id: 'source',
    folderId: folder.id,
    name: 'sheet',
    mime: 'application/pdf',
    size: 40,
    pinned: false,
    kind: 'practice',
    createdAt: 0,
    count: 0,
    status: 'pending',
  };
  mocks.read.mockResolvedValue({
    bytes: new TextEncoder().encode('%PDF-test'),
    mime: 'application/pdf',
  });
  mocks.save.mockImplementation(async (id, bytes) =>
    banks.set(id, JSON.parse(new TextDecoder().decode(bytes))),
  );
  mocks.readJob.mockImplementation(async (id) => jobs.get(id));
  mocks.saveJob.mockImplementation(async (id, value) => jobs.set(id, value));
  mocks.state.mockImplementation(async () => state);
  mocks.general.mockRejectedValue(new Error('Whole-file AI must not run'));
});
it('the real grammar import uses local questions and recovers only a failed question into the same bank', async () => {
  const page = make(1, [
    '1. Identify the (jury).',
    '1: collective noun',
    '2: common noun',
    '3: material noun',
    '4: abstract noun',
    '2. Identify the (wooden) table.',
    '1: Adverb',
    '2: Noun',
    '③ Adjective',
    '4: Verb',
    '3. We spoke soft(a)/softly(b)/softness(c).',
  ]);
  mocks.pdf.mockResolvedValue({
    count: 2,
    page: async (n) => (n === 1 ? page : key),
    close: vi.fn(),
    image: vi.fn(),
  });
  mocks.extract.mockImplementation(async (input) => {
    expect(input.area).toBe('grammar');
    expect(input.targets).toEqual([2]);
    expect(input.pages.map((p) => p.text).join(' ')).not.toContain('(jury)');
    expect(input.pages.map((p) => p.text).join(' ')).not.toContain('softness');
    return {
      questions: [
        {
          number: 2,
          part: '',
          stem: 'Identify the (wooden) table.',
          options: ['Adverb', 'Noun', 'Adjective', 'Verb'],
          answerId: 'C',
          page: 1,
          evidence: 'Identify the (wooden) table.',
          answerOrigin: 'pdf',
          explanation: '',
        },
      ],
      unresolved: [],
      diagnostics: [],
    };
  });
  const { importPractice } = await import('../src/services/workspace');
  await importPractice(
    'source',
    folder,
    () => state,
    async (fn) => {
      state = fn(state);
    },
    () => {},
  );
  expect(mocks.general).not.toHaveBeenCalled();
  expect(mocks.extract).toHaveBeenCalledOnce();
  const bank = banks.get('bank-source');
  expect(bank.questions.map((q) => q.id)).toEqual([
    'bank-source-q1',
    'bank-source-q2',
    'bank-source-q3',
  ]);
  expect(bank.questions[0].stem).toBe('Identify the (jury).');
  expect(bank.warnings).toEqual([]);
  expect(state.monty!.attachments.source.count).toBe(3);
  expect(state.monty!.attachments.source.status).toBe('ready');
});
it('a fully readable grammar sheet never calls AI', async () => {
  const page = make(1, [
    '1. Identify the (jury).',
    '1: collective noun',
    '2: common noun',
    '3: material noun',
    '4: abstract noun',
    '2. Identify the (wooden) table.',
    '1: Adverb',
    '2: Noun',
    '3: Adjective',
    '4: Verb',
    '3. We spoke soft(a)/softly(b)/softness(c).',
  ]);
  mocks.pdf.mockResolvedValue({
    count: 2,
    page: async (n) => (n === 1 ? page : key),
    close: vi.fn(),
    image: vi.fn(),
  });
  await (
    await import('../src/services/workspace')
  ).importPractice(
    'source',
    folder,
    () => state,
    async (fn) => {
      state = fn(state);
    },
    () => {},
  );
  expect(mocks.extract).not.toHaveBeenCalled();
  expect(mocks.general).not.toHaveBeenCalled();
  expect(banks.get('bank-source').questions).toHaveLength(3);
});
