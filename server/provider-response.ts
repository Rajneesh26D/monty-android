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

export function validateSourceSolution(
  solution: { text: string; pages: number[] },
  pages: { number: number; text: string; image?: string }[],
  normalize: (value: string) => string,
) {
  const referenced = solution.pages.map((number) => pages.find((page) => page.number === number));
  if (referenced.some((page) => !page)) return false;
  if (referenced.some((page) => page?.image)) return true;
  const source = normalize(referenced.map((page) => page?.text).join(' '));
  return source.includes(normalize(solution.text));
}
