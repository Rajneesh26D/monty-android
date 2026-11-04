export function parseQuestionSelection(text: string, total: number): number[] {
  const input = text
    .toLowerCase()
    .trim()
    .replace(/[–—−]/g, '-')
    .replace(/\b(?:questions?|numbers?|select|include|please|from)\b/g, ' ')
    .replace(/\b(?:through|until|till)\b/g, 'to')
    .replace(/\band\b/g, ',')
    .replace(/[;\n]+/g, ',')
    .trim();
  if (!Number.isSafeInteger(total) || total < 1)
    throw new Error('Select a sheet with ready questions.');
  if (!input) throw new Error('Enter question numbers or ranges.');
  if (input === 'all') return Array.from({ length: total }, (_, i) => i + 1);
  const selected = new Set<number>();
  for (const part of input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const match = /^(\d+)\s*(?:(?:to|-)\s*(\d+))?$/.exec(part);
    if (!match) throw new Error('Use numbers and ranges, for example: 1,2,5,6 to 20.');
    const start = Number(match[1]),
      end = Number(match[2] ?? match[1]);
    if (start < 1 || end > total || start > end)
      throw new Error(
        `Question numbers must be between 1 and ${total}, with ranges in ascending order.`,
      );
    for (let n = start; n <= end; n++) selected.add(n);
  }
  if (!selected.size) throw new Error('Select at least one question.');
  return [...selected].sort((a, b) => a - b);
}
export function formatQuestionSelection(numbers: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < numbers.length; i++) {
    const first = numbers[i];
    let last = first;
    while (numbers[i + 1] === last + 1) last = numbers[++i];
    parts.push(first === last ? String(first) : `${first}–${last}`);
  }
  return parts.join(', ');
}
