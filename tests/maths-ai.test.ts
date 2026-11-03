import { expect, it, vi, beforeEach } from 'vitest';
import { validateMaths } from '../server/maths';
import { inferxJSON } from '../server/inferx';
const input = {
  area: 'maths' as const,
  pages: [{ number: 2, text: '1. What is the sum of two and three? a) 4 b) 5 c) 6 d) 7' }],
  targets: [1],
  answers: [{ number: 1, part: '', answerId: 'B' as const }],
};
const question = {
  number: 1,
  part: '',
  stem: 'What is the sum of two and three?',
  options: ['4', '5', '6', '7'],
  answerId: 'B',
  page: 2,
  evidence: 'What is the sum of two and three?',
  answerOrigin: 'pdf',
  explanation: '',
};
it('validates source evidence, exact PDF keys, coverage and rejects duplicates or foreign questions', () => {
  expect(validateMaths({ questions: [question] }, input).unresolved).toEqual([]);
  for (const patch of [
    { answerId: 'A' },
    { page: 3 },
    { evidence: 'A quotation not present anywhere' },
    { options: ['5', '5'] },
    { number: 9 },
  ])
    expect(() => validateMaths({ questions: [{ ...question, ...patch }] }, input)).toThrow();
  expect(() => validateMaths({ questions: [question, question] }, input)).toThrow();
  expect(validateMaths({ questions: [] }, input).unresolved).toEqual([1]);
});
it('labels answers without a supplied key as AI and requires a reason', () => {
  const noKey = { ...input, answers: [] };
  expect(() => validateMaths({ questions: [question] }, noKey)).toThrow();
  expect(
    validateMaths(
      { questions: [{ ...question, explanation: 'Two plus three equals five.' }] },
      noKey,
    ).questions[0].answerOrigin,
  ).toBe('ai');
});
it('calls only the fixed provider, keeps credentials in the Authorization header and rejects truncation', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: '{"questions":[]}' } }],
      }),
    ),
  );
  await expect(inferxJSON('system', { pages: [] }, 'test-secret', fetcher)).resolves.toEqual({
    questions: [],
  });
  const [url, request] = fetcher.mock.calls[0];
  expect(url).toBe('https://model.inferx.net/endpoints/v1/chat/completions');
  expect(request.body).not.toContain('test-secret');
  expect(request.headers.Authorization).toBe('Bearer test-secret');
  fetcher.mockResolvedValue(
    new Response(
      JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }),
    ),
  );
  await expect(inferxJSON('system', {}, 'test-secret', fetcher)).rejects.toThrow('incomplete');
});
it('reports provider rate limits without treating an incomplete extraction as success', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 429 }));
  await expect(inferxJSON('system', {}, 'test-secret', fetcher)).rejects.toMatchObject({
    status: 429,
    retryAfter: 60,
  });
});
it('does not accept missing compound parts as complete coverage', () => {
  const compound = {
    ...input,
    answers: [
      { number: 1, part: 'i', answerId: 'B' as const },
      { number: 1, part: 'ii', answerId: 'B' as const },
    ],
  };
  expect(validateMaths({ questions: [{ ...question, part: 'i' }] }, compound).unresolved).toEqual([
    1,
  ]);
});
it('falls back from InferX capacity limits to a zero-price provider and validates cached results', async () => {
  const { mathsAI } = await import('../server/maths');
  const bucket = { get: vi.fn().mockResolvedValue(null), put: vi.fn() } as any;
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes('inferx')) return new Response('{}', { status: 429 });
    if (url.endsWith('/models'))
      return Response.json({
        data: [{ id: 'test-provider:free', pricing: { prompt: '0', completion: '0' } }],
      });
    return Response.json({
      choices: [
        { finish_reason: 'stop', message: { content: JSON.stringify({ questions: [question] }) } },
      ],
    });
  }) as any;
  const result = await mathsAI(input, 'test-inferx', bucket, fetcher, 'test-router');
  expect(result.questions).toHaveLength(1);
  expect(bucket.put).toHaveBeenCalledOnce();
  bucket.get.mockResolvedValue({ json: async () => result });
  fetcher.mockClear();
  expect(
    (await mathsAI(input, 'test-inferx', bucket, fetcher, 'test-router')).questions,
  ).toHaveLength(1);
  expect(fetcher).not.toHaveBeenCalled();
});
it('keeps valid questions when one model response contains a bad choice and recovers only that missing question', async () => {
  const { validatePartialQuestions } = await import('../server/maths');
  const next = {
    ...input,
    pages: [
      {
        number: 2,
        text: input.pages[0].text + '\n2. What is the sum of three and three? a) 4 b) 5 c) 6 d) 7',
      },
    ],
    targets: [1, 2],
    answers: [...input.answers, { number: 2, part: '', answerId: 'C' as const }],
  };
  const bad = {
    ...question,
    number: 2,
    stem: 'What is the sum of three and three?',
    evidence: 'What is the sum of three and three?',
    answerId: 'C',
    options: ['4', '5', 'invented', '7'],
  };
  const partial = validatePartialQuestions({ questions: [question, bad] }, next);
  expect(partial.questions.map((q) => q.number)).toEqual([1]);
  expect(partial.unresolved).toEqual([2]);
});
it('tries DeepSeek text extraction even when an optional page image is present', async () => {
  vi.resetModules();
  const { mathsAI } = await import('../server/maths');
  const bucket = { get: vi.fn().mockResolvedValue(null), put: vi.fn() } as any;
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify({ questions: [question] }) },
        },
      ],
    }),
  );
  const result = await mathsAI(
    { ...input, pages: [{ ...input.pages[0], image: 'data:image/jpeg;base64,AAAA' }] },
    'test-secret',
    bucket,
    fetcher,
  );
  expect(result.questions).toHaveLength(1);
  expect(fetcher.mock.calls[0][0]).toContain('inferx');
  expect(fetcher.mock.calls[0][1].body).not.toContain('data:image');
});
it('does not stop after three capacity-limited free models', async () => {
  vi.resetModules();
  const { mathsAI } = await import('../server/maths');
  const bucket = { get: vi.fn().mockResolvedValue(null), put: vi.fn() } as any;
  let attempts = 0;
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith('/models'))
      return Response.json({
        data: Array.from({ length: 4 }, (_, i) => ({
          id: `provider${i}:free`,
          pricing: { prompt: '0', completion: '0' },
        })),
      });
    attempts++;
    if (attempts < 4) return new Response('at capacity', { status: 429 });
    return Response.json({
      choices: [
        { finish_reason: 'stop', message: { content: JSON.stringify({ questions: [question] }) } },
      ],
    });
  }) as any;
  expect((await mathsAI(input, undefined, bucket, fetcher, 'test-router')).questions).toHaveLength(
    1,
  );
  expect(attempts).toBe(4);
});
it('continues after a model-specific HTTP 403 instead of treating it as a dead account key', async () => {
  vi.resetModules();
  const { mathsAI } = await import('../server/maths');
  const bucket = { get: vi.fn().mockResolvedValue(null), put: vi.fn() } as any;
  let attempts = 0;
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith('/models'))
      return Response.json({
        data: [
          { id: 'restricted:free', pricing: { prompt: '0', completion: '0' } },
          { id: 'available:free', pricing: { prompt: '0', completion: '0' } },
        ],
      });
    attempts++;
    if (attempts === 1) return new Response('Provider restriction', { status: 403 });
    return Response.json({
      choices: [
        { finish_reason: 'stop', message: { content: JSON.stringify({ questions: [question] }) } },
      ],
    });
  }) as any;
  const result = await mathsAI(input, undefined, bucket, fetcher, 'test-key');
  expect(attempts).toBe(2);
  expect(result.questions).toHaveLength(1);
  expect(result.diagnostics[0]).toMatchObject({ outcome: 'unavailable', status: 403 });
});
