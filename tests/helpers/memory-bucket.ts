export function memoryBucket() {
  let revision = 0;
  const items = new Map<string, { bytes: Uint8Array; etag: string; httpMetadata: any }>();
  const object = (key: string) => {
    const item = items.get(key);
    return item
      ? {
          key,
          etag: item.etag,
          httpEtag: '"' + item.etag + '"',
          size: item.bytes.length,
          httpMetadata: item.httpMetadata,
          body: new Blob([item.bytes]).stream(),
          json: async <T>() => JSON.parse(new TextDecoder().decode(item.bytes)) as T,
          text: async () => new TextDecoder().decode(item.bytes),
        }
      : null;
  };
  return {
    items,
    get: async (key: string) => object(key),
    head: async (key: string) => object(key),
    delete: async (key: string) => {
      items.delete(key);
    },
    list: async ({ prefix = '', limit = 1000 }: { prefix?: string; limit?: number }) => ({
      objects: [...items.keys()]
        .filter((k) => k.startsWith(prefix))
        .slice(0, limit)
        .map((key) => ({ key })),
      truncated: false,
    }),
    put: async (key: string, data: any, options: any = {}) => {
      const old = items.get(key),
        condition = options.onlyIf;
      const match =
        condition instanceof Headers
          ? condition.get('If-Match')?.replace(/^W\//, '').replaceAll('"', '')
          : condition?.etagMatches;
      const none = condition instanceof Headers ? condition.get('If-None-Match') : null;
      if ((match && match !== old?.etag) || (none === '*' && old)) return null;
      const bytes =
        typeof data === 'string'
          ? new TextEncoder().encode(data)
          : new Uint8Array(await new Response(data).arrayBuffer());
      items.set(key, { bytes, etag: String(++revision), httpMetadata: options.httpMetadata || {} });
      return object(key);
    },
  };
}
