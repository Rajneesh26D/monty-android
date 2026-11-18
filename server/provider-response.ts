export class APIError extends Error {
  diagnostics?: { provider: string; outcome: string; status?: number }[];
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export function parseModelJSON(text: string): unknown {
  const start = text.indexOf('{'),
    end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object returned');
  return JSON.parse(text.slice(start, end + 1));
}
