import { beforeEach, expect, it, vi } from 'vitest';
import { MathsParser, legacyMathItems } from '../src/pdf/content';
import { linesOf, type PageData, type TextItem } from '../src/pdf/parser';
import { upgradeState } from '../shared/migrate';
import { emptyState } from '../shared/types';
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  state: vi.fn(),
  readJob: vi.fn(),
  saveJob: vi.fn(),
  saveAttachment: vi.fn(),
  openPdf: vi.fn(),
}));
vi.mock('../src/storage/repository', () => ({
  readAttachment: mocks.read,
  readStoredState: mocks.state,
  readJob: mocks.readJob,
  saveJob: mocks.saveJob,
  saveAttachment: mocks.saveAttachment,
}));
vi.mock('../src/pdf/reader', () => ({ openPdf: mocks.openPdf }));
const item = (
  text: string,
  x: number,
  y: number,
  width: number,
  height = 10,
  fontName = 'body',
): TextItem => ({ text, x, y, width, height, fontName });
const items = [
  item('1.', 270, 80, 8),
  item('Question', 285, 80, 40),
  item('Find the value of', 300, 100, 75),
  item('�', 380, 100, 5, 10, 'math'),
  item('𝑥𝑥−𝑦𝑦', 385, 94.1, 13.77, 6.96, 'math'),
  item('𝑦𝑦', 389.68, 105.02, 4.41, 6.96, 'math'),
  item('× 100', 401.2, 100, 25.92),
  item('�', 427.12, 100, 4.88, 10, 'math'),
  item('%?', 432, 100, 13),
  item('a) 20', 300, 135, 30),
  item('b) 25', 370, 135, 30),
  item('Answer key', 300, 700, 50),
  item('1.', 310, 720, 8),
  item('A', 310, 730, 6),
];
const page: PageData = {
  number: 1,
  width: 600,
  height: 800,
  items,
  text: linesOf(items).join('\n'),
  hasVisualContent: false,
};
const makeBank = () => {
  const parser = new MathsParser(legacyMathItems);
  parser.add(page);
  return parser.finish('saved-bank');
};
let stored = makeBank();
const jobs = new Map<string, unknown>();
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  jobs.clear();
  stored = makeBank();
  const state = upgradeState(emptyState());
  state.monty!.attachments['source-pdf'] = {
    id: 'source-pdf',
    folderId: 'maths-percentage',
    name: 'Questions',
    mime: 'application/pdf',
    size: 20,
    pinned: false,
    kind: 'practice',
    createdAt: 0,
    bankId: 'saved-bank',
    count: 1,
    status: 'ready',
  };
  mocks.state.mockResolvedValue(state);
  mocks.read.mockImplementation(async (id: string) => ({
    bytes:
      id === 'saved-bank'
        ? new TextEncoder().encode(JSON.stringify(stored))
        : new TextEncoder().encode('%PDF-original'),
    mime: id === 'saved-bank' ? 'application/json' : 'application/pdf',
  }));
  mocks.readJob.mockImplementation(async (id: string) => jobs.get(id));
  mocks.saveJob.mockImplementation(async (id: string, data: unknown) => jobs.set(id, data));
  mocks.openPdf.mockResolvedValue({
    count: 1,
    page: async () => structuredClone(page),
    close: vi.fn(),
  });
});
it('corrects an existing bank from its original PDF and caches an offline view without overwriting shared data', async () => {
  const original = structuredClone(stored),
    { readBank } = await import('../src/services/workspace');
  expect(stored.questions).toHaveLength(1);
  const result = await readBank('saved-bank');
  expect(result.questions[0].stem).toContain('([[frac:x−y/y]] × 100)%?');
  expect(result.questions[0].id).toBe(original.questions[0].id);
  expect(stored).toEqual(original);
  expect(mocks.saveAttachment).not.toHaveBeenCalled();
  expect(mocks.saveJob).toHaveBeenCalledTimes(1);
  vi.resetModules();
  mocks.openPdf.mockRejectedValue(new Error('Offline'));
  const reopened = await (await import('../src/services/workspace')).readBank('saved-bank');
  expect(reopened.questions[0].stem).toBe(result.questions[0].stem);
  expect(mocks.openPdf).toHaveBeenCalledTimes(1); // Reopened using the source-bank hash and cached view.
});
it('keeps a user-edited question and refreshes the derived view when bank bytes change', async () => {
  await (await import('../src/services/workspace')).readBank('saved-bank');
  stored.questions[0].stem = 'My revised question';
  stored.questions[0].answerId = 'B';
  vi.resetModules();
  const result = await (await import('../src/services/workspace')).readBank('saved-bank');
  expect(result.questions[0].stem).toBe('My revised question');
  expect(result.questions[0].answerId).toBe('B');
  expect(mocks.openPdf).toHaveBeenCalledTimes(2);
  expect(mocks.saveAttachment).not.toHaveBeenCalled();
});
it('opens existing study material when the original is not available instead of clearing or blocking it', async () => {
  mocks.openPdf.mockRejectedValue(new Error('Original unavailable offline'));
  const result = await (await import('../src/services/workspace')).readBank('saved-bank');
  expect(result).toEqual(stored);
  expect(mocks.saveJob).not.toHaveBeenCalled();
  expect(mocks.saveAttachment).not.toHaveBeenCalled();
});
