import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { linesOf, type PageData } from '../src/pdf/parser';
import { MathsParser, IdiomsParser } from '../src/pdf/content';
import { bankSchema, DEFAULT_IDIOMS, DEFAULT_MATHS, type Attachment } from '../shared/monty';
import { mathsTests } from '../src/core/exams';
const output = process.argv[2] ?? '/workspace/toolchain/monty-starters';
mkdirSync(output, { recursive: true });
const sources = [];
for (const [file, kind, name, folderId] of [
  ['percentage.pdf', 'maths', 'Percentage', DEFAULT_MATHS],
  ['idioms.pdf', 'idioms', 'Idioms Lecture 01', DEFAULT_IDIOMS],
] as const) {
  const bytes = readFileSync('tests/fixtures/' + file),
    id = 'starter-' + kind + '-v1',
    bankId = 'starter-' + kind + '-bank-v1',
    parser = kind === 'maths' ? new MathsParser() : new IdiomsParser();
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n),
      view = page.getViewport({ scale: 1 }),
      content = await page.getTextContent();
    const items = content.items
      .filter((i) => 'str' in i)
      .map((i) => ({
        text: i.str,
        x: i.transform[4],
        y: view.height - i.transform[5],
        width: i.width,
        height: i.height,
      }));
    parser.add({
      number: n,
      width: view.width,
      height: view.height,
      items,
      text: linesOf(items).join('\n'),
      hasVisualContent: false,
    });
  }
  await pdf.destroy();
  const bank = bankSchema.parse(parser.finish(bankId));
  if (bank.warnings.length) throw new Error(bank.warnings.join('; '));
  if (bank.questions.length !== (kind === 'maths' ? 100 : 30))
    throw new Error('Unexpected starter count');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  const attachment: Attachment = {
    id,
    folderId,
    name,
    mime: 'application/pdf',
    size: bytes.length,
    pinned: false,
    kind: 'practice',
    createdAt: Date.now(),
    hash,
    bankId,
    count: bank.questions.length,
    status: 'ready',
  };
  writeFileSync(output + '/' + id + '.pdf', bytes);
  writeFileSync(output + '/' + bankId + '.json', JSON.stringify(bank));
  sources.push({
    attachment,
    bank: {
      id: bankId,
      kind: bank.kind,
      count: bank.questions.length,
      studyCount: bank.study.length,
    },
    tests: kind === 'maths' ? mathsTests(bank, folderId, id, name) : [],
  });
}
writeFileSync(output + '/manifest.json', JSON.stringify({ sources }));
console.log(
  JSON.stringify({
    sources: sources.map((s) => ({
      name: s.attachment.name,
      questions: s.bank.count,
      tests: s.tests.length,
    })),
  }),
);
