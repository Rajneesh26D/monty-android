import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { linesOf, parsePages, type PageData } from '../src/pdf/parser';
import { emptyState, uid } from '../shared/types';
import { mergeEntries, needsEnrichment } from '../src/core/vocabulary';
let state = emptyState();
const output = resolve(process.argv[2] ?? '.outputs/preload');
mkdirSync(output, { recursive: true });
for (const [file, name] of [
  ['3-LEC-1-SLIDE.pdf', 'LEC-1 Slide'],
  ['2-English-Special-1-Anto_Syno.Lec-2_Vivid-1-.pdf', 'LEC-2 Vivid'],
  ['4-LEC-2-CONCISE.pdf', 'LEC-2 Concise'],
]) {
  const bytes = readFileSync('tests/fixtures/' + file),
    id = uid(),
    pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise,
    pages: PageData[] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number),
      v = page.getViewport({ scale: 1 }),
      tc = await page.getTextContent(),
      ops = await page.getOperatorList();
    const items = tc.items
      .filter((i) => 'str' in i)
      .map((i) => ({
        text: i.str,
        x: i.transform[4],
        y: v.height - i.transform[5],
        height: i.height,
        width: i.width,
      }));
    pages.push({
      number,
      width: v.width,
      height: v.height,
      items,
      text: linesOf(items).join('\n'),
      hasVisualContent: ops.fnArray.some((n) =>
        [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(n),
      ),
    });
  }
  await pdf.destroy();
  const parsed = parsePages(pages, id),
    result = mergeEntries(state, parsed.entries);
  state = result.state;
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
  state.documents.push({
    id,
    name,
    hash,
    createdAt: Date.now(),
    entryIds: result.ids,
    status: 'pending',
    pendingPages: parsed.unknownPages,
  });
  writeFileSync(output + '/preload-' + id + '.pdf', bytes);
}
// These explanations report the source's classification and definition. They do
// not invent a separate dictionary definition for a listed relation.
for (const e of Object.values(state.entries)) {
  for (const relation of e.synonyms)
    if (!relation.explanation)
      relation.explanation = `Your PDF lists “${relation.term}” as a synonym of “${e.word}” (${e.meaningEn}). It expresses a similar idea in this context.`;
  for (const relation of e.antonyms)
    if (!relation.explanation)
      relation.explanation = `Your PDF lists “${relation.term}” as an antonym of “${e.word}” (${e.meaningEn}). It expresses a contrasting idea in this context.`;
}
for (const doc of state.documents) {
  const missing = doc.entryIds.filter((id) => needsEnrichment(state.entries[id]));
  doc.status = missing.length ? 'pending' : 'ready';
  if (missing.length)
    doc.error = `${missing.length} words still need AI completion. Tap Retry missing information.`;
}
writeFileSync(output + '/library.json', JSON.stringify(state));
console.log(
  JSON.stringify(
    {
      documents: state.documents.map((d) => ({
        name: d.name,
        words: d.entryIds.length,
        status: d.status,
      })),
      uniqueWords: Object.keys(state.entries).length,
      missing: Object.values(state.entries)
        .filter(needsEnrichment)
        .map((e) => ({
          word: e.word,
          hi: !!e.meaningHi,
          mnemonic: !!e.mnemonic,
          example: !!e.example,
          syn: e.synonyms.length,
          ant: e.antonyms.length,
        })),
    },
    null,
    2,
  ),
);
