import 'core-js/stable';

// PDF.js consumes ReadableStreams with for-await. Older Android WebViews have
// streams but not their async iterator, so core-js alone is insufficient.
if (typeof ReadableStream !== 'undefined') {
  const prototype = ReadableStream.prototype as unknown as Record<PropertyKey, unknown>;
  if (!prototype[Symbol.asyncIterator]) {
    Object.defineProperty(prototype, Symbol.asyncIterator, {
      configurable: true,
      writable: true,
      value: async function* (this: ReadableStream<unknown>) {
        const reader = this.getReader();
        let finished = false;
        try {
          while (true) {
            const result = await reader.read();
            if (result.done) {
              finished = true;
              return;
            }
            yield result.value;
          }
        } finally {
          if (!finished) await reader.cancel();
          reader.releaseLock();
        }
      },
    });
  }
}
