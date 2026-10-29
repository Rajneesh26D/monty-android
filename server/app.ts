import { multipart } from './multipart';
import { storeUpload } from './uploads';
import { processSchema } from '../shared/validation';
import { stateSchema } from '../shared/state-schema';
import { APIError } from './models';
import { generalRequestSchema } from '../shared/general';
import { generalAI } from './general';
import { cachedAI } from './cache';
interface Env {
  BUCKET: R2Bucket;
  OPENROUTER_API_KEY: string;
}
type Assets = Record<string, { type: string; data: string }>;
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });
// Hosted behind Sites owner-only authentication. Keep the Site private: the
// dispatch access boundary protects browser and service requests before this Worker.
export function createWorker(assets: Assets) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url),
        path = url.pathname;
      try {
        if (!path.startsWith('/api/')) {
          if (!['GET', 'HEAD'].includes(request.method))
            return new Response('Method not allowed', { status: 405 });
          const asset = assets[path === '/' ? '/index.html' : path];
          if (!asset) return new Response('Not found', { status: 404 });
          return new Response(
            request.method === 'HEAD'
              ? null
              : Uint8Array.from(atob(asset.data), (x) => x.charCodeAt(0)),
            {
              encodeBody: 'manual',
              headers: {
                'Content-Type': asset.type,
                'Content-Encoding': 'gzip',
                'Cache-Control': path.startsWith('/assets/')
                  ? 'private,max-age=31536000,immutable'
                  : 'no-cache',
                'X-Content-Type-Options': 'nosniff',
                'Referrer-Policy': 'same-origin',
              },
            },
          );
        }
        const origin = request.headers.get('Origin');
        if (origin && origin !== url.origin) return json({ error: 'Origin not allowed' }, 403);
        if (path === '/api/health')
          return json({ ok: true, storage: !!env.BUCKET, ai: !!env.OPENROUTER_API_KEY });
        if (!env.BUCKET)
          return json(
            { error: 'Online storage is temporarily unavailable. Your phone copy is safe.' },
            503,
          );
        // A single owner-private Site has one library, including access through the
        // platform's owner-authorized service token. No user-supplied object keys.
        if (path === '/api/state') {
          if (request.method === 'GET') {
            const object = await env.BUCKET.get('owner/library.json');
            return object
              ? new Response(
                  JSON.stringify({ state: await object.json(), revision: object.httpEtag }),
                  {
                    headers: {
                      'Content-Type': 'application/json',
                      'Cache-Control': 'no-store',
                      ETag: object.httpEtag,
                    },
                  },
                )
              : json({ state: null });
          }
          if (request.method === 'PUT') {
            if (!request.headers.has('If-Match') && request.headers.get('If-None-Match') !== '*')
              return json({ error: 'A library revision is required.' }, 428);
            const text = await request.text();
            if (text.length > 15_000_000)
              return json({ error: 'Export a backup and split very large libraries.' }, 413);
            const result = stateSchema.safeParse(JSON.parse(text));
            if (!result.success) return json({ error: 'Invalid library backup.' }, 400);
            result.data.settings.backendUrl = '';
            const old = await env.BUCKET.get('owner/library.json');
            if (old) {
              const previous = (await old.json()) as { version: number };
              if (previous.version === 2 && result.data.version !== 2)
                return json(
                  { error: 'Monty has been updated. Refresh this page to keep all your progress.' },
                  409,
                );
              if (previous.version === 1 && result.data.version === 2) {
                const existingBackup = await env.BUCKET.get('owner/backups/v1-before-monty.json');
                if (!existingBackup)
                  await env.BUCKET.put(
                    'owner/backups/v1-before-monty.json',
                    JSON.stringify(previous),
                  );
              }
            }
            if (result.data.version === 2 && !result.data.monty)
              return json({ error: 'Monty workspace missing' }, 400);
            // Older open tabs may still send nested folders. Preserve all folder IDs
            // and their contents while enforcing one level for every client.
            if (result.data.monty)
              for (const folder of Object.values(result.data.monty.folders)) folder.parentId = null;
            const conditions = new Headers();
            const match = request.headers.get('If-Match');
            if (match) conditions.set('If-Match', match.replace(/^W\//, ''));
            else conditions.set('If-None-Match', '*');
            const saved = await env.BUCKET.put('owner/library.json', JSON.stringify(result.data), {
              onlyIf: conditions,
              httpMetadata: { contentType: 'application/json' },
            });
            return saved
              ? json({ ok: true, revision: saved.httpEtag }, 200, { ETag: saved.httpEtag })
              : json({ error: 'The online copy changed. Your phone copy is safe.' }, 412);
          }
        }
        const file = path.match(/^\/api\/pdfs\/([A-Za-z0-9_-]{1,100})$/);
        if (file) {
          const key = 'owner/pdfs/' + file[1] + '.pdf';
          const parts = await multipart(request, env.BUCKET, key, true);
          if (parts) return parts;
          if (request.method === 'GET') {
            const object = await env.BUCKET.get(key);
            return object
              ? new Response(object.body, {
                  headers: {
                    'Content-Type': 'application/pdf',
                    'Cache-Control': 'private,no-store',
                  },
                })
              : json({ error: 'PDF not found' }, 404);
          }
          if (request.method === 'DELETE') {
            await env.BUCKET.delete(key);
            return json({ ok: true });
          }
          if (request.method === 'PUT') {
            await storeUpload(request, env.BUCKET, key, 'application/pdf', true);
            return json({ ok: true });
          }
        }
        const attachment = path.match(/^\/api\/files\/([A-Za-z0-9_-]{1,100})$/);
        if (attachment) {
          const key = 'owner/files/' + attachment[1];
          const parts = await multipart(request, env.BUCKET, key);
          if (parts) return parts;
          if (request.method === 'GET') {
            const file = await env.BUCKET.get(key);
            if (!file) return json({ error: 'File not found' }, 404);
            return new Response(file.body, {
              headers: {
                'Content-Type': file.httpMetadata?.contentType ?? 'application/octet-stream',
                'Content-Disposition': 'attachment',
                'Cache-Control': 'private,no-store',
                'X-Content-Type-Options': 'nosniff',
              },
            });
          }
          if (request.method === 'PUT') {
            const mime = request.headers.get('Content-Type') ?? 'application/octet-stream';
            await storeUpload(request, env.BUCKET, key, mime);
            return json({ ok: true });
          }
          if (request.method === 'DELETE') {
            await env.BUCKET.delete(key);
            return json({ ok: true });
          }
        }
        if (path === '/api/extract' && request.method === 'POST') {
          const text = await request.text();
          if (text.length > 8000000) return json({ error: 'Processing chunk too large' }, 413);
          const parsed = generalRequestSchema.safeParse(JSON.parse(text));
          if (!parsed.success) return json({ error: 'Invalid study pages' }, 400);
          if (!env.OPENROUTER_API_KEY)
            return json({ error: 'AI is unavailable; your import is saved.' }, 503);
          return json(await generalAI(parsed.data, env.OPENROUTER_API_KEY, env.BUCKET));
        }
        if (path === '/api/process' && request.method === 'POST') {
          if (!request.headers.get('Content-Type')?.includes('application/json'))
            return json({ error: 'Expected JSON' }, 415);
          if (Number(request.headers.get('Content-Length') || 0) > 8_000_000)
            return json({ error: 'Batch too large' }, 413);
          const text = await request.text();
          if (text.length > 8_000_000) return json({ error: 'Batch too large' }, 413);
          const parsed = processSchema.safeParse(JSON.parse(text));
          if (!parsed.success) return json({ error: 'Invalid processing batch' }, 400);
          const input = parsed.data;
          if (
            (input.mode === 'discover' && !input.pages.length) ||
            (input.mode === 'enrich' &&
              (!input.entries.length || input.entries.some((e) => !e.candidateId)))
          )
            return json({ error: 'Supply source pages or vocabulary candidates' }, 400);
          if (!env.OPENROUTER_API_KEY)
            return json({ error: 'AI is temporarily unavailable. Your import is saved.' }, 503);
          return json(await cachedAI(input, env.OPENROUTER_API_KEY, env.BUCKET));
        }
        return json({ error: 'Not found' }, 404);
      } catch (error) {
        if (error instanceof APIError)
          return json(
            { error: error.message, retryAfter: error.retryAfter },
            error.status,
            error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {},
          );
        if (error instanceof SyntaxError) return json({ error: 'Invalid JSON' }, 400);
        return json(
          {
            error:
              'The service is temporarily unavailable. Your phone copy is safe; retry shortly.',
          },
          503,
        );
      }
    },
  };
}
