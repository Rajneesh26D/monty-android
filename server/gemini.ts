import { APIError, parseModelJSON } from './provider-response';

type Page = { number: number; text: string; image?: string };

export async function geminiJSON(
  prompt: string,
  input: object,
  key: string,
  fetcher: typeof fetch,
  milliseconds: number,
  pages: Page[] = [],
) {
  const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [
    { text: JSON.stringify(input) },
  ];
  for (const { number, text, image } of pages) {
    parts.push({ text: JSON.stringify({ number, text }) });
    if (image) {
      parts.push({ text: `Image for page ${number}:` });
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: image.split(',', 2)[1] } });
    }
  }
  const response = await fetcher(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
      signal: AbortSignal.timeout(milliseconds),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 12288,
          thinkingConfig: { thinkingBudget: 1024 },
        },
      }),
    },
  );
  if (!response.ok) throw new APIError(response.status, 'Gemini could not process this request.');
  const data = (await response.json()) as {
    candidates?: {
      finishReason?: string;
      content?: { parts?: { text?: string; thought?: boolean }[] };
    }[];
  };
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason !== 'STOP') throw new Error('Incomplete Gemini JSON response');
  return parseModelJSON(
    candidate.content?.parts
      ?.filter((part) => !part.thought)
      .map((part) => part.text || '')
      .join('') || '',
  );
}

export function logProviderFailure(provider: string, error: unknown) {
  const status = error instanceof APIError ? error.status : undefined;
  console.warn('AI attempt failed', {
    provider,
    ...(status ? { status } : {}),
    error: error instanceof Error ? error.name : 'Unknown',
  });
}
