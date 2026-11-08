import { afterEach, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { articleFromHTML, articleFromText, wordTokens, wordContext } from '../src/core/articles';
import { wordMeaningSchema } from '../shared/reading';
import { stateSchema } from '../shared/state-schema';
import { emptyState } from '../shared/types';
import { upgradeState } from '../shared/migrate';
import { mergeCloudState } from '../src/storage/merge';
import { createWorker } from '../server/app';
import { memoryBucket } from './helpers/memory-bucket';
const meaning = {
  word: 'resilient',
  partOfSpeech: 'adjective',
  meaningEn: 'Able to recover after difficulty.',
  meaningHi: 'कठिनाइयों से उबरने में सक्षम',
  synonyms: ['strong', 'adaptable', 'hardy'],
  antonyms: ['fragile', 'weak', 'vulnerable'],
};
const article = {
  id: 'article-1',
  title: 'Habits',
  createdAt: 1,
  wordCount: 5,
  preview: 'A resilient mind grows.',
};
afterEach(() => vi.unstubAllGlobals());
it('imports plain text paragraphs, counts hyphenated words and bounds lookup context', () => {
  expect(articleFromText('One paragraph.\r\n\r\nAnother.').map((b) => b.text)).toEqual([
    'One paragraph.',
    'Another.',
  ]);
  expect(wordTokens('A resilient, well-read reader’s mind.').filter((_, i) => i % 2 === 1)).toEqual(
    ['A', 'resilient', 'well-read', 'reader’s', 'mind'],
  );
  expect(wordContext('x'.repeat(3000), 1500, 9).length).toBeLessThan(1000);
  expect(() => articleFromText('   ')).toThrow();
  expect(() => articleFromText('x'.repeat(2_000_001))).toThrow();
});
it('turns untrusted HTML into text blocks without scripts, resources, chrome or executable markup', () => {
  const { window } = parseHTML('<html><body></body></html>');
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('Node', window.Node);
  vi.stubGlobal('Element', window.Element);
  const result = articleFromHTML(
    '<title>Reading</title><nav>Skip me</nav><article><h1>A safe read</h1><p>Hello <strong>world</strong> &amp; readers.<img src="https://evil.test/track"></p><script>alert(1)</script><iframe src="https://evil.test"></iframe><p onclick="alert(1)">Stay <a href="javascript:alert(1)">resilient</a>.</p><blockquote>Keep going.</blockquote><ul><li>Read</li><li>Learn</li></ul></article><footer>Skip footer</footer>',
  );
  expect(result.title).toBe('A safe read');
  expect(result.blocks).toEqual([
    { kind: 'heading', text: 'A safe read' },
    { kind: 'paragraph', text: 'Hello world & readers.' },
    { kind: 'paragraph', text: 'Stay resilient.' },
    { kind: 'quote', text: 'Keep going.' },
    { kind: 'paragraph', text: 'Read' },
    { kind: 'paragraph', text: 'Learn' },
  ]);
  expect(JSON.stringify(result)).not.toMatch(/evil|alert|onclick|iframe|Skip/);
});
it('preserves article metadata and saved definitions through schema, migration and concurrent sync', () => {
  const base = upgradeState(emptyState());
  base.reading = { articles: { [article.id]: article }, words: {} };
  const local = structuredClone(base),
    remote = structuredClone(base);
  local.reading!.words.resilient = {
    ...meaning,
    id: 'resilient',
    context: 'A resilient mind grows.',
    articleTitle: 'Habits',
    savedAt: 2,
  };
  remote.reading!.articles.two = { ...article, id: 'two', title: 'Another' };
  const merged = stateSchema.parse(mergeCloudState(base, local, remote));
  expect(Object.keys(merged.reading!.articles)).toHaveLength(2);
  expect(merged.reading!.words.resilient.meaningHi).toBe(meaning.meaningHi);
  expect(upgradeState(merged).reading).toEqual(merged.reading);
  const deleted = structuredClone(merged);
  delete deleted.reading!.articles[article.id];
  delete deleted.reading!.words.resilient;
  const next = mergeCloudState(merged, deleted, merged);
  expect(next.reading!.articles[article.id]).toBeUndefined();
  expect(next.reading!.words.resilient).toBeUndefined();
});
it('requires exactly three distinct related words and nonempty meanings', () => {
  expect(wordMeaningSchema.safeParse(meaning).success).toBe(true);
  expect(
    wordMeaningSchema.safeParse({ ...meaning, synonyms: ['strong', 'strong', 'hardy'] }).success,
  ).toBe(false);
  expect(wordMeaningSchema.safeParse({ ...meaning, antonyms: ['weak'] }).success).toBe(false);
  expect(wordMeaningSchema.safeParse({ ...meaning, meaningHi: '' }).success).toBe(false);
});
function call(body: unknown, bucket = memoryBucket()) {
  return createWorker({}).fetch(
    new Request('https://example.com/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'article-word', ...(body as object) }),
    }),
    { BUCKET: bucket, OPENROUTER_API_KEY: 'server-test-key' } as any,
  );
}
const catalog = {
  data: [
    {
      id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      pricing: { prompt: '0', completion: '0', request: '0', image: '0' },
      supported_parameters: ['temperature', 'response_format', 'reasoning'],
    },
    { id: 'thinkingmachines/inkling:free', pricing: { prompt: '0', completion: '0' } },
    { id: 'paid:free', pricing: { prompt: '1', completion: '0' } },
  ],
};
it('rejects invalid lookup input before calling any provider', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  expect((await call({ word: 'two words' })).status).toBe(400);
  expect((await call({ word: 'resilient', context: 'x'.repeat(2001) })).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
it('uses free compatible providers, validates fallback responses and caches by word and context without exposing keys', async () => {
  const bucket = memoryBucket();
  let calls = 0;
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/models')) return Response.json(catalog);
    const body = JSON.parse(options!.body as string);
    calls++;
    expect(body.model).not.toBe('paid:free');
    expect(new Headers(options!.headers).get('Authorization')).toBe('Bearer server-test-key');
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify(calls === 1 ? { ...meaning, antonyms: ['weak'] } : meaning),
          },
        },
      ],
    });
  });
  vi.stubGlobal('fetch', fetcher);
  const first = await call({ word: 'resilient', context: 'A resilient mind grows.' }, bucket);
  expect(first.status).toBe(200);
  expect(await first.json()).toEqual(meaning);
  expect(calls).toBe(2);
  const cached = await call({ word: 'resilient', context: 'A resilient mind grows.' }, bucket);
  expect(cached.status).toBe(200);
  expect(calls).toBe(2);
  expect(
    [...bucket.items.values()].map((x) => new TextDecoder().decode(x.bytes)).join(''),
  ).not.toContain('server-test-key');
  const other = await call({ word: 'resilient', context: 'A resilient economy.' }, bucket);
  expect(other.status).toBe(200);
  expect(calls).toBe(3);
});
it('returns a retryable rate-limit response and does not cache errors', async () => {
  const bucket = memoryBucket();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('/models') ? Response.json(catalog) : new Response('{}', { status: 429 }),
    ),
  );
  const r = await call({ word: 'resilient' }, bucket);
  expect(r.status).toBe(429);
  expect(r.headers.get('Retry-After')).toBe('60');
  expect(bucket.items.size).toBe(0);
});
it('does not fabricate three antonyms for words without a reliable set', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('/models')
        ? Response.json(catalog)
        : Response.json({ choices: [{ message: { content: '{"unavailable":true}' } }] }),
    ),
  );
  expect((await call({ word: 'the' })).status).toBe(422);
});
it('protects articles from writes by an older client that omits the reading library', async () => {
  const bucket = memoryBucket(),
    state = upgradeState(emptyState());
  await bucket.put(
    'owner/library.json',
    JSON.stringify({ ...state, reading: { articles: { [article.id]: article }, words: {} } }),
  );
  const r = await createWorker({}).fetch(
    new Request('https://example.com/api/state', {
      method: 'PUT',
      headers: { 'If-Match': '"1"', 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    }),
    { BUCKET: bucket } as any,
  );
  expect(r.status).toBe(409);
  expect(
    ((await (await bucket.get('owner/library.json'))!.json()) as any).reading.articles[article.id],
  ).toBeTruthy();
});
