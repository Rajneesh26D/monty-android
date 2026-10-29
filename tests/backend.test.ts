import { it, expect, vi } from 'vitest';
import { runAI, validateOutput, PRIORITY, APIError } from '../server/models';
import type { ProcessRequest } from '../shared/validation';
const input: ProcessRequest = {
  mode: 'enrich',
  pages: [],
  entries: [
    {
      candidateId: 'a',
      word: 'Calm',
      meaningEn: 'peaceful',
      meaningHi: 'शांत',
      mnemonic: '',
      example: '',
      synonyms: [],
      antonyms: [],
      sourcePages: [1],
    },
  ],
};
const output = {
  entries: [
    {
      ...input.entries[0],
      mnemonic: 'Calm your mind.',
      example: 'She remained calm.',
      synonyms: ['Serene', 'Peaceful', 'Tranquil'].map((term) => ({
        term,
        explanation: term + ' also describes a state without disturbance.',
      })),
      antonyms: ['Agitated', 'Anxious', 'Restless'].map((term) => ({
        term,
        explanation: term + ' describes disturbance instead of peacefulness.',
      })),
    },
  ],
};
const catalog = {
  data: PRIORITY.map((id) => ({
    id,
    pricing: { prompt: '0', completion: '0' },
    architecture: { input_modalities: ['text', 'image'] },
    supported_parameters: ['response_format'],
  })),
};
it('advances from invalid output to the next free model and never calls a paid model', async () => {
  const calls: string[] = [];
  const fetcher = vi.fn(async (url: any, init?: RequestInit) => {
    if (String(url).endsWith('/models')) return Response.json(catalog);
    const model = JSON.parse(init!.body as string).model;
    calls.push(model);
    return Response.json({
      choices: [{ message: { content: calls.length === 1 ? 'invalid' : JSON.stringify(output) } }],
    });
  }) as unknown as typeof fetch;
  const before = vi.fn(async () => {});
  const r = await runAI(input, 'test-key', before, fetcher);
  expect(calls).toEqual(PRIORITY.slice(0, 2));
  expect(calls.every((x) => x.endsWith(':free'))).toBe(true);
  expect(r.model).toBe(PRIORITY[1]);
  expect(before).toHaveBeenCalledTimes(2);
});
it('stops on account-wide daily quota instead of burning all fallback requests', async () => {
  let calls = 0;
  const fetcher = (async (url: any) => {
    if (String(url).endsWith('/models')) return Response.json(catalog);
    calls++;
    return Response.json(
      { error: { message: 'free-models-per-day quota exhausted' } },
      { status: 429 },
    );
  }) as typeof fetch;
  await expect(runAI(input, 'test-key', async () => {}, fetcher)).rejects.toMatchObject({
    status: 429,
  });
  expect(calls).toBe(1);
});
it('rejects omitted candidates, changed identities, and overlapping options', () => {
  expect(() => validateOutput({ entries: [] }, input)).toThrow('coverage');
  expect(() =>
    validateOutput({ entries: [{ ...output.entries[0], candidateId: 'other' }] }, input),
  ).toThrow('identity');
  expect(() =>
    validateOutput(
      { entries: [{ ...output.entries[0], antonyms: output.entries[0].synonyms }] },
      input,
    ),
  ).toThrow();
});
it('preserves all source option terms', () => {
  const source = structuredClone(input);
  source.entries[0].synonyms = [{ term: 'Unruffled', explanation: '' }];
  const result = validateOutput(output, source) as typeof output;
  expect(result.entries[0].synonyms).toEqual(source.entries[0].synonyms);
});

it('accepts concise missing-field patches and retains supplied meanings verbatim', () => {
  const result = validateOutput(
    {
      entries: [
        {
          candidateId: 'a',
          mnemonic: 'Memory',
          example: 'Remain calm.',
          synonyms: output.entries[0].synonyms,
          antonyms: output.entries[0].antonyms,
        },
      ],
    },
    input,
  ) as typeof output;
  expect(result.entries[0].meaningEn).toBe('peaceful');
  expect(result.entries[0].meaningHi).toBe('शांत');
});
it('does not misreport a provider rate limit as a daily account quota', async () => {
  let calls = 0;
  const fetcher = (async (url: any) => {
    if (String(url).endsWith('/models')) return Response.json(catalog);
    calls++;
    return Response.json(
      { error: { message: 'Temporarily rate-limited by upstream provider' } },
      { status: 429 },
    );
  }) as typeof fetch;
  await expect(runAI(input, 'test', async () => {}, fetcher)).rejects.toMatchObject({
    status: 429,
    message: expect.stringContaining('does not necessarily mean your daily limit'),
  });
  expect(calls).toBe(10);
});
