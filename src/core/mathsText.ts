// Keep the source bank unchanged. This display-only view selects the existing
// English text from bilingual PDFs; it never translates or invents a question.
export function englishMathText(text: string): string {
  const result = text
    .split('\n')
    .map((line) => {
      const clean = line.replace(/\([^()]*[\u0900-\u097f][^()]*\)/g, '').trim();
      const index = clean.search(/[\u0900-\u097f]/);
      if (index < 0) return clean;
      const prefix = clean
        .slice(0, index)
        .replace(/\s+\/\s+.*$/, '')
        .replace(/[\s/([]+$/g, '')
        .trim();
      return /[A-Za-z]{2,}/.test(prefix) ? prefix : '';
    })
    .filter(Boolean)
    .join('\n');
  return result || text;
}

// PDF lines are positioned for a printed page, not a phone. Rejoin prose
// while retaining explicit paragraphs, numbered statements and source citations.
export function flowMathText(text: string): string {
  const block = (line: string) =>
    /^(?:\(?\d{1,2}[.)]|\([ivx]+\)|[ivx]+[.)]|[A-D][.)])\s|^\[SSC\b|^\|/i.test(line);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let result = '';
  for (const raw of lines) {
    const line = raw.replace(/[\t ]+/g, ' ').trim();
    if (!line) {
      if (result && !result.endsWith('\n\n')) result += '\n\n';
      continue;
    }
    if (result && !result.endsWith('\n')) result += block(line) ? '\n' : ' ';
    result += line;
  }
  return result.trim();
}
