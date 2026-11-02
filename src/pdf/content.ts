import type { PageData, TextItem } from './parser';
import { linesOf } from './parser';
import type { Bank, MCQ, StudyItem } from '../../shared/monty';
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
export const MATH_LAYOUT_VERSION = 4;

// Retained only to recognize untouched text in banks imported before this fix.
export const legacyMathItems = (items: TextItem[]) => groupMathItems(items, /^[\dxyz+−-]+$/);

function groupMathItems(
  items: TextItem[],
  expression: RegExp,
  correctGeometry = false,
): TextItem[] {
  const source = items.filter((i) => i.text.trim());
  const used = new Set<number>(),
    out: TextItem[] = [];
  const heights = source.filter((i) => i.height > 0).map((i) => Math.round(i.height));
  const mode =
    heights.sort(
      (a, b) => heights.filter((x) => x === b).length - heights.filter((x) => x === a).length,
    )[0] ?? 10;
  for (let i = 0; i < source.length; i++) {
    if (used.has(i)) continue;
    const a = source[i];
    if (a.height < mode * 0.83 && expression.test(a.text.trim())) {
      const j = source.findIndex(
        (b, n) =>
          n !== i &&
          !used.has(n) &&
          b.y > a.y + a.height * 0.7 &&
          b.y < a.y + a.height * 2.4 &&
          Math.abs(a.x + a.width / 2 - (b.x + b.width / 2)) < 3 &&
          Math.abs(a.height - b.height) < 1 &&
          expression.test(b.text.trim()),
      );
      if (j >= 0) {
        const b = source[j];
        used.add(j);
        out.push({
          ...a,
          ...(correctGeometry ? { x: Math.min(a.x, b.x) } : {}),
          text: `[[frac:${a.text.trim()}/${b.text.trim()}]]`,
          y: (a.y + b.y) / 2 + 0.5,
          height: mode,
          width: Math.max(a.width, b.width),
        });
        continue;
      }
      const parent = source.find(
        (b, n) =>
          n !== i &&
          b.height > a.height * 1.15 &&
          a.x >= b.x + b.width - 2 &&
          a.x - b.x - b.width < 4 &&
          b.y - a.y > 1 &&
          b.y - a.y < mode,
      );
      if (parent && /^\d+$/.test(a.text.trim())) {
        out.push({
          ...a,
          ...(correctGeometry ? { x: parent.x + parent.width } : {}),
          text: a.text
            .trim()
            .split('')
            .map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)])
            .join(''),
          y: parent.y,
          height: mode,
        });
        continue;
      }
    }
    out.push(a);
  }
  return out;
}

export function mathItemsV3(items: TextItem[], enhanced = false): TextItem[] {
  const doubled = /^([\u{1D400}-\u{1D7FF}])\1$/u;
  const duplicatedFonts = new Set(
    items
      .filter(
        (item) =>
          item.fontName &&
          doubled.test(item.text.trim()) &&
          item.width > 0 &&
          item.width < item.height * 0.9,
      )
      .map((item) => item.fontName),
  );
  const normalized = items.map((item) => {
    let text = item.text;
    // A one-glyph-wide item mapped to two identical math letters proves a
    // broken ToUnicode map for this font. Collapse pairs, not real "xx" prose.
    if (
      duplicatedFonts.has(item.fontName) ||
      (!item.fontName && doubled.test(text.trim()) && item.width < item.height * 0.9)
    )
      text = text.replace(/([\u{1D400}-\u{1D7FF}])\1/gu, '$1');
    text = text.replace(/[\u{1D400}-\u{1D7FF}]/gu, (char) => char.normalize('NFKC'));
    return { ...item, text };
  });
  const grouped = groupMathItems(
    (enhanced ? attachPowers(normalized) : normalized).sort((a, b) => a.y - b.y || a.x - b.x),
    /^[\dA-Za-z⁰¹²³⁴⁵⁶⁷⁸⁹+−^{}. -]+$/,
    true,
  );
  const replacements = grouped.map((item) => ({ ...item }));
  // Lost round brackets in equation fonts appear as two isolated replacement
  // glyphs at the surrounding text baseline. Recover only a bounded math group
  // containing a geometrically reconstructed fraction; never replace prose �.
  for (const left of replacements) {
    if (left.text.trim() !== '\ufffd') continue;
    const candidates = replacements
      .filter(
        (right) =>
          right !== left &&
          right.text.trim() === '\ufffd' &&
          right.x > left.x + left.width &&
          right.x - left.x < left.height * 30 &&
          Math.abs(right.y - left.y) < left.height * 0.25 &&
          Math.abs(right.height - left.height) < 1 &&
          (!left.fontName || !right.fontName || left.fontName === right.fontName),
      )
      .sort((a, b) => a.x - b.x);
    for (const right of candidates) {
      const inner = replacements.filter(
        (item) =>
          item !== left &&
          item !== right &&
          item.text.trim() &&
          item.x >= left.x + left.width - 0.5 &&
          item.x + item.width <= right.x + 0.5 &&
          Math.abs(item.y - left.y) < left.height * 0.35,
      );
      const text = inner.map((item) => item.text).join(' ');
      if (!text.includes('[[frac:') || !/^[\dA-Za-z\s+−\-×÷*/=.,%()[\]:]+$/.test(text)) continue;
      left.text = '(';
      right.text = ')';
      break;
    }
  }
  return replacements;
}
// Resolve complete superscript runs before pairing fractions. This prevents a
// stem exponent from being paired with a numerator in the following option row.
function attachPowers(items: TextItem[]): TextItem[] {
  const out = items.map((i) => ({ ...i })),
    used = new Set<TextItem>();
  for (const exp of [...out].sort((a, b) => a.x - b.x)) {
    if (used.has(exp) || !/^[0-9.+−-]+$/.test(exp.text.trim())) continue;
    const base = out
      .filter(
        (b) =>
          b !== exp &&
          !used.has(b) &&
          b.height > exp.height * 1.15 &&
          b.y - exp.y > 1 &&
          b.y - exp.y < b.height * 0.48 &&
          exp.x >= b.x + b.width - 1 &&
          exp.x - b.x - b.width < 3 &&
          /[\dA-Za-z)]$/.test(b.text.trim()),
      )
      .sort((a, b) => b.x + b.width - a.x - a.width)[0];
    if (!base) continue;
    const run = [exp];
    let end = exp.x + exp.width;
    for (const next of out
      .filter(
        (i) =>
          i !== exp &&
          !used.has(i) &&
          i.x >= end - 0.1 &&
          Math.abs(i.y - exp.y) < 0.5 &&
          Math.abs(i.height - exp.height) < 1 &&
          /^[0-9.+−-]+$/.test(i.text.trim()),
      )
      .sort((a, b) => a.x - b.x)) {
      if (next.x - end > 2) break;
      run.push(next);
      end = next.x + next.width;
    }
    const power = run.map((i) => i.text.trim()).join('');
    base.text += /^\d+$/.test(power)
      ? power
          .split('')
          .map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)])
          .join('')
      : `^{${power}}`;
    base.width = end - base.x;
    for (const i of run) used.add(i);
  }
  return out.filter((i) => !used.has(i));
}
export function mathItems(items: TextItem[]) {
  return mathItemsV3(items, true);
}
export class MathsParser {
  constructor(
    private readonly layout: (items: TextItem[]) => TextItem[] = mathItems,
    private readonly structureVersion = MATH_LAYOUT_VERSION,
  ) {}
  private rows: { number: number; lines: string[]; page: number; pages: number[] }[] = [];
  private keys = new Map<number, string>();
  private partKeys = new Map<number, Map<string, string>>();
  private problems: string[] = [];
  add(page: PageData) {
    const marker = page.items.find((i) => /answer\s*key|उत्तर\s*कुंजी/i.test(i.text));
    const keyY = marker?.y ?? Infinity;
    if (marker) {
      const data = page.items.filter(
        (i) => i.y >= keyY - 1 && i.y < page.height - 45 && i.text.trim(),
      );
      for (const n of data) {
        const match = n.text.trim().match(/^(\d{1,4})[.)]$/);
        if (!match) continue;
        const nearby = data.filter(
          (a) =>
            /^[A-Ha-h]$/.test(a.text.trim()) &&
            a.y - n.y > 2 &&
            a.y - n.y < 22 &&
            Math.abs(a.x - n.x) < 5,
        );
        if (this.structureVersion >= 4) {
          const parts = data
            .filter((a) => a.y - n.y > 2 && a.y - n.y < 22 && Math.abs(a.x - n.x) < 80)
            .flatMap((a) => [...a.text.matchAll(/\b([ivx]+)\)\s*[–−-]\s*([A-H])/gi)]);
          if (
            parts.length > 1 &&
            data.some(
              (a) =>
                a.y - n.y > 2 && a.y - n.y < 22 && a.x < n.x && /i\)\s*[–−-]\s*[A-H]/i.test(a.text),
            ) &&
            data.some(
              (a) =>
                a.y - n.y > 2 &&
                a.y - n.y < 22 &&
                a.x > n.x &&
                /[ivx]+\)\s*[–−-]\s*[A-H]/i.test(a.text),
            )
          )
            this.partKeys.set(
              Number(match[1]),
              new Map(parts.map((m) => [m[1].toLowerCase(), m[2].toUpperCase()])),
            );
        }
        const inline = data.filter(
          (a) =>
            /^[A-Ha-h]$/.test(a.text.trim()) &&
            Math.abs(a.y - n.y) < 2 &&
            a.x >= n.x + n.width &&
            a.x - n.x < 35,
        );
        const candidates = nearby.length === 1 ? nearby : inline;
        if (candidates.length === 1) {
          const num = Number(match[1]),
            answer = candidates[0].text.trim().toUpperCase();
          if (this.keys.has(num) && this.keys.get(num) !== answer)
            this.problems.push(`Conflicting answer for question ${num}.`);
          this.keys.set(num, answer);
        }
      }
      for (const line of linesOf(data)) {
        for (const m of line.matchAll(/(?:^|\s)(\d{1,4})[.)]\s*([A-H])(?=\s|$)/g))
          if (!this.keys.has(Number(m[1]))) this.keys.set(Number(m[1]), m[2]);
      }
    }
    // Footer depth varies by book. Locate contact/footer baselines rather than
    // discarding a fixed 58-point strip that can contain the final options.
    const footer = page.items.filter(
      (i) => i.y > page.height * 0.9 && /\+91[\s-]*\d[\d\s-]{7,}/.test(i.text),
    );
    const bottom =
      this.structureVersion < 3
        ? page.height - 58
        : Math.min(page.height - 25, ...footer.map((i) => i.y - 4));
    const section = page.items.filter((i) =>
      /multiple(?:\s+type|\s+choice)?\s+questions|practice\s+questions|exercises?/i.test(i.text),
    );
    const start =
      this.structureVersion >= 4 && !this.rows.length && section.length
        ? Math.max(25, ...section.map((i) => i.y))
        : 25;
    const items = this.layout(
      page.items.filter((i) => i.y > start && i.y < Math.min(keyY - 3, bottom)),
    );
    // Detect the actual question columns, rather than joining rows across the gutter.
    const headXs = items.filter((i) => /^\d{1,4}[.)]$/.test(i.text.trim())).map((i) => i.x);
    const two =
      headXs.some((x) => x > page.width * 0.48) && headXs.some((x) => x < page.width * 0.25);
    // A continuation-only page can still have the same two-column book layout.
    const gutter = page.width / 2;
    const columns =
      two || (this.rows.length && page.width < page.height)
        ? [items.filter((i) => i.x < gutter), items.filter((i) => i.x >= gutter)]
        : [items];
    for (const col of columns)
      for (const line of linesOf(col)) {
        // Some PDFs place the first word directly against "100.".
        const head = line.match(
          this.structureVersion < 3
            ? /^(\d{1,4})[.)](?:\s+(.*)|$)/
            : /^(\d{1,4})[.)](?:\s+(.*)|([^\d\s].*)|$)/,
        );
        const number = head ? Number(head[1]) : 0,
          last = this.rows.at(-1);
        if (head && (!last ? number === 1 : number === last.number + 1))
          this.rows.push({
            number,
            lines: head[2] || head[3] ? [head[2] || head[3]] : [],
            page: page.number,
            pages: [page.number],
          });
        else if (last) {
          last.lines.push(line);
          if (!last.pages.includes(page.number)) last.pages.push(page.number);
        }
      }
  }
  sourceAnswers() {
    return [
      ...Array.from(this.keys, ([number, answerId]) => ({ number, part: '', answerId })),
      ...Array.from(this.partKeys, ([number, parts]) =>
        Array.from(parts, ([part, answerId]) => ({ number, part, answerId })),
      ).flat(),
    ].filter((a) => !this.partKeys.has(a.number) || a.part);
  }
  finish(id: string): Bank {
    const questions: MCQ[] = [];
    const warnings = [...this.problems];
    const expanded = this.rows.flatMap((row) => {
      const keys = this.partKeys.get(row.number);
      if (!keys) return [{ ...row, part: '' }];
      const parts: (typeof row & { part: string })[] = [];
      for (const line of row.lines) {
        const m = line.match(/^([ivx]+)\)\s*(.*)/i);
        if (m && keys.has(m[1].toLowerCase()))
          parts.push({ ...row, part: m[1].toLowerCase(), lines: [m[2]] });
        else if (parts.length) parts.at(-1)!.lines.push(line);
      }
      return parts.length === keys.size ? parts : [{ ...row, part: '' }];
    });
    for (const row of expanded) {
      const stem: string[] = [],
        options: { id: string; label: string; text: string }[] = [];
      for (const line of row.lines) {
        if (this.structureVersion >= 4 && /^class\s*[:.-]?\s*\d+/i.test(line)) continue;
        if (this.structureVersion >= 4 && options.length && /^\[[^\]]+\]$/.test(line)) {
          stem.push(line);
          continue;
        }

        if (/^[a-h][).]\s*/i.test(line) && (options.length > 0 || /^[aA][).]/.test(line))) {
          const matches = [...line.matchAll(/(?:^|\s)([a-h])[).]\s*/gi)];
          for (let j = 0; j < matches.length; j++) {
            const m = matches[j];
            options.push({
              id: m[1].toUpperCase(),
              label: m[1].toUpperCase(),
              text: clean(line.slice(m.index! + m[0].length, matches[j + 1]?.index)),
            });
          }
        } else if (options.length)
          options[options.length - 1].text = clean(options.at(-1)!.text + ' ' + line);
        else stem.push(line);
      }
      const answer = row.part
        ? this.partKeys.get(row.number)?.get(row.part)
        : this.keys.get(row.number);
      if (
        !answer ||
        options.length < 2 ||
        !options.some((o) => o.id === answer) ||
        options.some((o) => !o.text) ||
        new Set(options.map((o) => o.id)).size !== options.length
      ) {
        warnings.push(
          `Question ${row.number}: check its options and answer key (page ${row.page}).`,
        );
        continue;
      }
      questions.push({
        id: `${id}-q${row.number}${row.part ? '-' + row.part : ''}`,
        ...(row.part ? { sourcePart: row.part } : {}),
        number: row.number,
        stem: (row.part ? `(${row.part}) ` : '') + stem.join('\n'),
        meaningHi: '',
        passage: '',
        options,
        answerId: answer,
        page: row.page,
        pages: row.pages,
        origin: 'pdf',
        answerOrigin: 'pdf',
        evidence: 'Answer key from the original PDF',
        explanation: '',
      });
    }
    const missing = [...this.keys.keys()].filter((n) => !this.rows.some((r) => r.number === n));
    if (missing.length) warnings.push(`Could not locate questions: ${missing.join(', ')}.`);
    if (!this.rows.length)
      warnings.push(
        'No readable numbered questions were found. Scanned or diagram-only questions need a text-based PDF.',
      );
    return {
      version: 1,
      id,
      kind: 'maths',
      questions,
      study: [],
      warnings,
      ...(this.layout === mathItems ? { mathLayoutVersion: MATH_LAYOUT_VERSION } : {}),
    };
  }
}
export class IdiomsParser {
  private entries: StudyItem[] = [];
  constructor(study: StudyItem[] = []) {
    this.entries = study;
  }
  private previousRight: StudyItem | undefined;
  add(page: PageData) {
    const midpoint = page.width / 2;
    for (let col = 0; col < 2; col++) {
      const left = col * midpoint,
        right = left + midpoint;
      const items = page.items.filter(
        (i) =>
          i.x >= left &&
          i.x < right &&
          i.y > 45 &&
          i.y < page.height - 40 &&
          i.text.trim() &&
          !/IDIOMS\s*LECTURE/i.test(i.text),
      );
      const split = Math.min(...items.map((i) => i.x)) + page.width * 0.17;
      const titles = items.filter((i) => i.x < split),
        meanings = items.filter((i) => i.x >= split);
      const titleLines = groupLines(titles);
      // Row tops are found by a bracketed Hindi meaning in the meaning column.
      const starts = groupLines(meanings).filter(
        (g) => /^\(/.test(g.text) && /[\u0900-\u097f]/.test(g.text),
      );
      for (let n = 0; n < starts.length; n++) {
        const top = starts[n].y - 3,
          bottom = starts[n + 1] ? starts[n + 1].y - 3 : page.height - 40;
        const phrase = clean(
          titleLines
            .filter((g) => g.y >= top && g.y < bottom)
            .map((g) => g.text)
            .join(' '),
        )
          .replace(/:\s*$/, '')
          .replace(/-\s+/g, '-');
        const body = clean(linesOf(meanings.filter((i) => i.y >= top && i.y < bottom)).join(' '));
        if (!phrase) continue;
        const hi = body.match(/^\((.*?)\)\s*(.*)$/);
        const e: StudyItem = {
          id: `idiom-${page.number}-${col}-${n}`,
          title: phrase,
          text: hi?.[2] ?? body,
          hindi: hi?.[1] ?? '',
          page: page.number,
        };
        this.entries.push(e);
        if (col === 1) this.previousRight = e;
      }
      const first = starts[0]?.y ?? Infinity;
      const continuation = clean(linesOf(meanings.filter((i) => i.y < first - 3)).join(' '));
      if (col === 0 && continuation && this.previousRight)
        this.previousRight.text = clean(this.previousRight.text + ' ' + continuation);
    }
  }
  finish(id: string): Bank {
    const study = this.entries.map((e, i) => ({ ...e, id: `${id}-i${i + 1}` }));
    const questions = study.flatMap((e, i) => {
      const other = study.filter(
        (x) => x.id !== e.id && clean(x.text).toLowerCase() !== clean(e.text).toLowerCase(),
      );
      const seen = new Set<string>();
      const distractors = other
        .filter((x) => {
          const k = clean(x.text).toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(i % Math.max(1, other.length - 3), (i % Math.max(1, other.length - 3)) + 3);
      if (!e.text || !distractors.length) return [];
      const choices = [
        { id: 'correct', label: '', text: e.text },
        ...distractors.map((x, n) => ({ id: 'other-' + n, label: '', text: x.text })),
      ];
      const offset = i % choices.length;
      const options = [...choices.slice(offset), ...choices.slice(0, offset)].map((o, n) => ({
        ...o,
        label: String.fromCharCode(65 + n),
      }));
      return [
        {
          id: e.id,
          number: i + 1,
          stem: `Choose the meaning of “${e.title}”.`,
          meaningHi: e.hindi,
          passage: '',
          options,
          answerId: 'correct',
          page: e.page,
          pages: [e.page],
          origin: 'pdf' as const,
          answerOrigin: 'pdf' as const,
          evidence: e.text,
          explanation: e.text,
        },
      ];
    });
    return {
      version: 1,
      id,
      kind: 'idioms',
      study,
      questions,
      warnings: study.length
        ? []
        : ['No idioms were detected in this layout. Try the general importer.'],
    };
  }
}
function groupLines(items: TextItem[]) {
  const groups: { y: number; items: TextItem[] }[] = [];
  for (const i of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let g = groups.find((g) => Math.abs(g.y - i.y) < 2.8);
    if (!g) {
      g = { y: i.y, items: [] };
      groups.push(g);
    }
    g.items.push(i);
  }
  return groups
    .map((g) => ({ y: g.y, text: linesOf(g.items).join(' ') }))
    .sort((a, b) => a.y - b.y);
}
