import { expect, it, vi } from 'vitest';
import { generalAI } from '../server/general';
import { memoryBucket } from './helpers/memory-bucket';

const pages = [
  { number: 1, text: 'The area of a rectangle is the product of its length and width.' },
  { number: 2, text: '', image: 'data:image/jpeg;base64,YWJj' },
];
const study = [{ title: 'Rectangle area', text: pages[0].text, page: 1 }];
const result = { study, questions: [] };
const candidate = (value: unknown) =>
  Response.json({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
  });

it('uses Gemini first for a mixed text and scanned maths chunk and keeps the image page label', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    expect(new Headers(init?.headers).get('X-goog-api-key')).toBe('gemini-key');
    expect(JSON.parse(init!.body as string).contents[0].parts.slice(-2)).toEqual([
      { text: 'Image for page 2:' },
      { inlineData: { mimeType: 'image/jpeg', data: 'YWJj' } },
    ]);
    return candidate(result);
  });
  const bucket = memoryBucket() as unknown as R2Bucket;
  const input = { area: 'maths' as const, pages };
  await expect(
    generalAI(input, 'openrouter-key', bucket, fetcher, 'inferx-key', 'gemini-key'),
  ).resolves.toMatchObject({ study });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('falls back to InferX for readable pages if Gemini returns invalid source pages', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(candidate({ study: [{ ...study[0], page: 9 }], questions: [] }))
    .mockResolvedValueOnce(
      Response.json({ choices: [{ message: { content: JSON.stringify(result) } }] }),
    );
  const bucket = memoryBucket() as unknown as R2Bucket;
  await expect(
    generalAI(
      { area: 'maths', pages: [pages[0]] },
      undefined,
      bucket,
      fetcher,
      'inferx-key',
      'gemini-key',
    ),
  ).resolves.toMatchObject({ study });
  expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).hostname)).toEqual([
    'generativelanguage.googleapis.com',
    'model.inferx.net',
  ]);
});
