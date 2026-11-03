import { APIError, parseModelJSON } from './models';
// Fixed provider URL/model: credentials never travel to a client-supplied host.
export async function inferxJSON(
  prompt: string,
  input: unknown,
  key: string,
  fetcher: typeof fetch = fetch,
  milliseconds = 90000,
) {
  const response = await fetcher('https://model.inferx.net/endpoints/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    signal: AbortSignal.timeout(milliseconds),
    body: JSON.stringify({
      model: 'deepseek-v4.1-flash-1017-basic',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: JSON.stringify(input) },
      ],
      max_tokens: 6000,
    }),
  });
  if (!response.ok)
    throw new APIError(
      [401, 403, 429].includes(response.status) ? response.status : 503,
      response.status === 429
        ? 'The AI provider is busy. Completed chunks are saved; retry shortly.'
        : 'The AI provider could not process this chunk. Your PDF is saved.',
      response.status === 429 ? 60 : undefined,
    );
  const data = (await response.json()) as any;
  if (data.choices?.[0]?.finish_reason === 'length')
    throw new APIError(503, 'The AI response was incomplete. Retry with a smaller page chunk.');
  return parseModelJSON(data.choices?.[0]?.message?.content ?? '');
}
