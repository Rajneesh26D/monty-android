import { aiResponseSchema, discoverySchema, type ProcessRequest } from '../shared/validation';
import { SYSTEM_PROMPT, DISCOVERY_PROMPT, ENRICH_PROMPT } from './prompt';
export const PRIORITY = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'thinkingmachines/inkling:free',
  'minimax/minimax-m3.1-flash:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3.5-super-vl:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'dots-studio/dots-3-note-preview:free',
  'recursive/flint-v1.0:free',
  'xingchen-agi/xing4.0-29b-a4b:free',
];
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
interface Model {
  id: string;
  pricing: Record<string, string>;
  architecture?: { input_modalities?: string[] };
  supported_parameters?: string[];
}
let cached: { expires: number; models: Model[] } | undefined;
export async function freeModels(fetcher: typeof fetch = fetch): Promise<Model[]> {
  if (cached && cached.expires > Date.now()) return cached.models;
  const r = await fetcher('https://openrouter.ai/api/v1/models', {
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok)
    throw new APIError(
      503,
      'Could not check the current free-model catalog. Your import is saved; retry later.',
    );
  const data = (await r.json()) as { data: Model[] };
  const models = data.data.filter(
    (m) =>
      m.id.endsWith(':free') &&
      Number(m.pricing?.prompt) === 0 &&
      Number(m.pricing?.completion) === 0 &&
      ['request', 'image'].every((k) => !m.pricing[k] || Number(m.pricing[k]) === 0),
  );
  cached = { expires: Date.now() + 3600000, models };
  return models;
}
export function parseModelJSON(text: string): unknown {
  const start = text.indexOf('{'),
    end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object returned');
  return JSON.parse(text.slice(start, end + 1));
}
export function validateOutput(value: unknown, input: ProcessRequest) {
  const allowed = new Set([
    ...input.pages.map((p) => p.number),
    ...input.entries.flatMap((e) => e.sourcePages),
  ]);
  if (input.mode === 'discover') {
    const result = discoverySchema.parse(value);
    if (result.candidates.some((e) => e.sourcePages.some((n) => !allowed.has(n))))
      throw new Error('Invalid source page');
    return result;
  }
  const raw = value as { entries?: Record<string, any>[] };
  if (!Array.isArray(raw?.entries) || raw.entries.length !== input.entries.length)
    throw new Error('Incomplete candidate coverage');
  const found = new Set<string>();
  const entries = raw.entries.map((patch) => {
    const original = input.entries.find((e) => e.candidateId === patch.candidateId);
    if (
      !original ||
      !patch.candidateId ||
      found.has(patch.candidateId) ||
      (patch.word && patch.word.toLowerCase() !== original.word.toLowerCase())
    )
      throw new Error('Candidate identity changed');
    found.add(patch.candidateId);
    // Copy source fields ourselves. A model cannot overwrite supplied text.
    const entry = { ...original };
    for (const k of [
      'meaningEn',
      'meaningHi',
      'mnemonic',
      'example',
      'synonyms',
      'antonyms',
    ] as const)
      if (!original[k].length) Object.assign(entry, { [k]: patch[k] });
    return entry;
  });
  const result = aiResponseSchema.parse({ entries });
  for (const e of result.entries) {
    const original = input.entries.find((x) => x.candidateId === e.candidateId)!;
    if (
      !e.meaningEn ||
      !e.meaningHi ||
      !e.mnemonic ||
      !e.example ||
      !e.synonyms.length ||
      !e.antonyms.length
    )
      throw new Error('Missing required vocabulary fields');
    if (!original.meaningHi && !/[\u0900-\u097f]/.test(e.meaningHi))
      throw new Error('Hindi meaning required');
    for (const k of ['synonyms', 'antonyms'] as const)
      if (
        !original[k].length &&
        (e[k].length !== 3 ||
          e[k].some((r) => !r.explanation || r.term.toLowerCase() === e.word.toLowerCase()))
      )
        throw new Error('Missing required vocabulary fields');
  }
  return result;
}
export async function runAI(
  input: ProcessRequest,
  key: string,
  beforeCall: () => Promise<void>,
  fetcher: typeof fetch = fetch,
) {
  const models = await freeModels(fetcher),
    vision = input.pages.some((p) => p.image);
  const ranked = [
    ...PRIORITY.map((id) => models.find((m) => m.id === id)).filter((m): m is Model => !!m),
    ...models.filter((m) => !PRIORITY.includes(m.id)),
  ];
  const eligible = ranked.filter(
    (m) => !vision || !!m.architecture?.input_modalities?.includes('image'),
  );
  if (!eligible.length)
    throw new APIError(
      503,
      'No compatible free model is available. Import progress has been saved.',
    );
  const content: any[] = [
    {
      type: 'text',
      text:
        (input.mode === 'discover' ? DISCOVERY_PROMPT : ENRICH_PROMPT) +
        '\nDOCUMENT DATA:\n' +
        JSON.stringify({
          entries: input.entries.map((e) => ({
            candidateId: e.candidateId,
            word: e.word,
            context: {
              meaningEn: e.meaningEn,
              meaningHi: e.meaningHi,
              synonyms: e.synonyms.map((r) => r.term),
              antonyms: e.antonyms.map((r) => r.term),
            },
            missing: (
              ['meaningEn', 'meaningHi', 'mnemonic', 'example', 'synonyms', 'antonyms'] as const
            ).filter((k) => !e[k].length),
          })),
          pages: input.pages.map(({ number, text }) => ({ number, text })),
        }),
    },
  ];
  for (const p of input.pages)
    if (p.image) content.push({ type: 'image_url', image_url: { url: p.image } });
  const failures = { rate: 0, provider: 0, output: 0, timeout: 0 };
  const deadline = Date.now() + 150000;
  for (const model of eligible.slice(0, 10)) {
    if (Date.now() > deadline) break;
    await beforeCall();
    try {
      const r = await fetcher('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({
          model: model.id,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content },
          ],
          max_tokens:
            input.mode === 'discover'
              ? 6000
              : Math.min(
                  6000,
                  600 +
                    input.entries.reduce(
                      (sum, e) =>
                        sum +
                        (
                          [
                            'meaningEn',
                            'meaningHi',
                            'mnemonic',
                            'example',
                            'synonyms',
                            'antonyms',
                          ] as const
                        ).reduce(
                          (n, k) =>
                            n +
                            (!e[k].length ? (k === 'synonyms' || k === 'antonyms' ? 450 : 180) : 0),
                          0,
                        ),
                      0,
                    ),
                ),
          ...(model.supported_parameters?.includes('reasoning')
            ? { reasoning: { enabled: false } }
            : {}),
          ...(model.supported_parameters?.includes('temperature') ? { temperature: 0.1 } : {}),
          ...(model.supported_parameters?.includes('response_format')
            ? { response_format: { type: 'json_object' } }
            : {}),
        }),
      });
      const json = (await r.json()) as any;
      if (!r.ok) {
        console.warn('AI provider status', { model: model.id, status: r.status });
        if (r.status === 401)
          throw new APIError(
            401,
            'The backend OpenRouter key was rejected. Update the backend secret.',
          );
        if (r.status === 402 || (r.status === 403 && json.error?.metadata?.limit_source))
          throw new APIError(
            429,
            'OpenRouter account access or quota is unavailable. Your import is saved.',
          );
        if (
          r.status === 429 &&
          /per.day|daily|quota|free-models-per-day/i.test(JSON.stringify(json))
        )
          throw new APIError(
            429,
            'OpenRouter’s free daily quota is exhausted. Resume your import after the quota resets.',
            86400,
          );
        if (r.status === 429) failures.rate++;
        else failures.provider++;
        continue;
      }
      const text = json.choices?.[0]?.message?.content;
      if (typeof text !== 'string') {
        failures.output++;
        console.warn('AI output missing', { model: model.id });
        continue;
      }
      const result = validateOutput(parseModelJSON(text), input);
      return { ...result, model: model.id };
    } catch (e) {
      if (e instanceof APIError)
        throw e; /* A timeout or invalid response advances to the next free model. */
      if (e instanceof Error && /Timeout|Abort/.test(e.name)) failures.timeout++;
      else failures.output++;
      console.warn('AI attempt failed', {
        model: model.id,
        error: e instanceof Error ? e.name : 'Unknown',
      });
    }
  }
  throw new APIError(
    failures.rate && !failures.output ? 429 : 503,
    failures.rate && !failures.output
      ? 'Free providers are busy or temporarily rate-limited (this does not necessarily mean your daily limit). Your words are saved; retry shortly.'
      : failures.output
        ? 'Free models returned incomplete or invalid output for these words. Other progress is saved; retry missing information.'
        : 'Free providers did not respond in time. Your words are saved; retry shortly.',
    failures.rate ? 60 : undefined,
  );
}
