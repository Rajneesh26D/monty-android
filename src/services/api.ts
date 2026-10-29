import { aiResponseSchema, discoverySchema, type ProcessRequest } from '../../shared/validation';
import { getToken, setToken } from '../storage/repository';
// Avoid newer AbortSignal static methods: Android 7-era WebViews only have
// AbortController and abort events. Always release the timer and listener.
async function request(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  milliseconds: number,
  external?: AbortSignal,
) {
  const controller = new AbortController();
  let expired = false;
  const abort = () => controller.abort();
  if (external?.aborted) abort();
  else external?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, milliseconds);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || 'The service is unavailable. Retry later.');
    return json;
  } catch (e) {
    if (expired) throw new Error('The request timed out. Your import progress is saved.');
    throw e;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', abort);
  }
}
export function normalizeBackend(value: string): string {
  const url = new URL(value.trim());
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
  )
    throw new Error('Use an HTTPS backend address.');
  if (url.username || url.password || url.search || url.hash)
    throw new Error('Enter the backend address without credentials, query, or fragment.');
  return url.origin;
}
export async function connectBackend(address: string, code: string) {
  const url = normalizeBackend(address);
  const json = await request(url + '/pair', { code: code.trim() }, {}, 20000);
  if (!/^[a-f0-9]{64}$/.test(json.token))
    throw new Error('The backend returned an invalid device credential.');
  await setToken(json.token);
  return url;
}
export async function processBatch(url: string, input: ProcessRequest, signal?: AbortSignal) {
  if (import.meta.env.VITE_HOSTED === 'true') {
    const json = await request('/api/process', input, {}, 330000, signal);
    return input.mode === 'discover' ? discoverySchema.parse(json) : aiResponseSchema.parse(json);
  }
  const token = await getToken();
  if (!url || !token)
    throw new Error(
      'Saved on this device. Connect the free backend in Settings to fill missing information.',
    );
  const json = await request(
    normalizeBackend(url) + '/process',
    input,
    { Authorization: `Bearer ${token}` },
    330000,
    signal,
  );
  return input.mode === 'discover' ? discoverySchema.parse(json) : aiResponseSchema.parse(json);
}

export async function extractGeneral(
  input: import('../../shared/general').GeneralRequest,
  signal?: AbortSignal,
) {
  if (import.meta.env.VITE_OFFLINE === 'true')
    throw new Error(
      'AI importing needs the online app. Your existing questions and quizzes work offline.',
    );
  const json = await request('/api/extract', input, {}, 180000, signal);
  const { generalOutputSchema } = await import('../../shared/general');
  return generalOutputSchema.parse(json);
}
