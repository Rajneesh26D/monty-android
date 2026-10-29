import { it, expect, afterAll } from 'vitest';
const original = Object.getOwnPropertyDescriptor(ReadableStream.prototype, Symbol.asyncIterator);
afterAll(() => {
  if (original) Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, original);
});
it('reads PDF-style stream chunks and cancels correctly on older WebViews', async () => {
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
    value: undefined,
    configurable: true,
    writable: true,
  });
  await import('../src/polyfills');
  const stream = new ReadableStream({
    start(c) {
      c.enqueue('first');
      c.enqueue('second');
      c.close();
    },
  });
  const chunks: string[] = [];
  for await (const chunk of stream as any) chunks.push(chunk);
  expect(chunks).toEqual(['first', 'second']);
  let cancelled = false;
  const early = new ReadableStream({
    start(c) {
      c.enqueue(1);
      c.enqueue(2);
    },
    cancel() {
      cancelled = true;
    },
  });
  for await (const _chunk of early as any) break;
  expect(cancelled).toBe(true);
  expect(early.locked).toBe(false);
});
