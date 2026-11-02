import { expect, it, vi, beforeEach } from 'vitest';
import type { Bank } from '../shared/monty';
const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), extract: vi.fn() }));
vi.mock('../src/storage/repository', () => ({ readJob: mocks.read, saveJob: mocks.save }));
vi.mock('../src/services/api', () => ({ extractMaths: mocks.extract }));
import { recoverMaths } from '../src/services/mathsRecovery';
const bank: Bank = {
  version: 1,
  id: 'bank',
  kind: 'maths',
  questions: [],
  study: [],
  warnings: ['Question 1: check its options and answer key (page 1).'],
};
const text = 'Q1: What is two plus three? A. 4 B. 5 C. 6 D. 7';
const page = {
  number: 1,
  width: 600,
  height: 800,
  items: [{ text, x: 40, y: 100, height: 12, width: 400 }],
  text,
  hasVisualContent: false,
};
const pdf = { count: 1, page: vi.fn(async () => page), image: vi.fn(), close: vi.fn() };
const result = {
  questions: [
    {
      number: 1,
      part: '',
      stem: 'What is two plus three?',
      options: ['4', '5', '6', '7'],
      answerId: 'B',
      page: 1,
      evidence: 'What is two plus three?',
      answerOrigin: 'pdf',
      explanation: '',
    },
  ],
  unresolved: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue(undefined);
  mocks.extract.mockResolvedValue(result);
});
it('recovers unsupported numbering and retains source keys and stable IDs, then reuses saved chunks', async () => {
  const saved = new Map();
  mocks.read.mockImplementation(async (k) => saved.get(k));
  mocks.save.mockImplementation(async (k, v) => saved.set(k, v));
  const known = [{ number: 1, part: '', answerId: 'B' }];
  const fixed = await recoverMaths(bank, known, 'source', pdf, () => {});
  expect(fixed.warnings).toEqual([]);
  expect(fixed.questions[0].id).toBe('bank-q1');
  expect(mocks.extract.mock.calls[0][0].answers).toEqual(known);
  expect(mocks.extract.mock.calls[0][0].targets).toEqual([1]);
  await recoverMaths(bank, known, 'source', pdf, () => {});
  expect(mocks.extract).toHaveBeenCalledOnce();
});
it('preserves parser warnings when the provider fails and honors cancellation', async () => {
  mocks.extract.mockRejectedValue(new Error('Provider is busy'));
  const fixed = await recoverMaths(bank, [], 'source', pdf, () => {});
  expect(fixed.warnings).toContain(bank.warnings[0]);
  expect(fixed.warnings).toContain('Provider is busy');
  const controller = new AbortController();
  controller.abort();
  await expect(recoverMaths(bank, [], 'source', pdf, () => {}, controller.signal)).rejects.toThrow(
    'paused',
  );
});
it('uses page images when text is absent and keeps uncertain AI coverage visible', async () => {
  const scan = { ...page, items: [], text: '', hasVisualContent: true };
  const scanned = {
    ...pdf,
    page: vi.fn(async () => scan),
    image: vi.fn(async () => 'data:image/jpeg;base64,AAAA'),
  };
  mocks.extract.mockResolvedValue({ ...result, unresolved: [1] });
  const fixed = await recoverMaths(
    { ...bank, warnings: ['No readable numbered questions were found.'] },
    [],
    'source',
    scanned,
    () => {},
  );
  expect(scanned.image).toHaveBeenCalledWith(1);
  expect(mocks.extract.mock.calls[0][0].pages[0].image).toBe('data:image/jpeg;base64,AAAA');
  expect(fixed.warnings.join(' ')).toContain('unresolved');
  expect(mocks.save).not.toHaveBeenCalled();
});
it('limits dense numbered pages to six target questions per request', async () => {
  const dense = Array.from(
    { length: 13 },
    (_, i) => `${i + 1}. Some source question with choices?`,
  ).join('\n');
  const document = {
    ...pdf,
    page: vi.fn(async () => ({ ...page, text: dense, items: [{ ...page.items[0], text: dense }] })),
  };
  mocks.extract.mockImplementation(async (input) => ({
    questions: input.targets.map((number) => ({ ...result.questions[0], number })),
    unresolved: [],
  }));
  const fixed = await recoverMaths(
    {
      ...bank,
      warnings: [
        'Could not locate questions: ' +
          Array.from({ length: 13 }, (_, i) => i + 1).join(', ') +
          '.',
      ],
    },
    [],
    'source',
    document,
    () => {},
  );
  expect(mocks.extract.mock.calls.map((call) => call[0].targets.length)).toEqual([6, 6, 1]);
  expect(fixed.questions).toHaveLength(13);
  expect(fixed.warnings).toEqual([]);
});
