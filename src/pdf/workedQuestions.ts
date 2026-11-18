import type { MCQ, Bank } from '../../shared/monty';
import { mathItems } from './content';
import type { Graphics } from './graphics';
import { positionedLines, type PageData } from './parser';

type Line = ReturnType<typeof positionedLines>[number] & { page: number };
type Row = { number: number; page: number; question: Line[]; solution: Line[]; worked: boolean };
const start = /^(?:Q(?:uestion)?\s*[.:]?\s*)?(\d{1,4})[.)](?:\s+(\S.*)|([^\d\s].*))$/i;
const solution = /^(?:worked\s+solution|solution|sol\.)\s*(?:[:.−–—-]\s*|$)/i;
const label = /(?:^|\s)(?:\(([A-H])\)|([A-H])[)\.])\s*/gi;
const clean = (text: string) => text.replace(/[\u0000]/g, '').trim();
const idOf = (m: RegExpMatchArray) => (m[1] || m[2]).toUpperCase();

function choicesOf(lines: Line[]) {
  const options: { id: string; label: string; text: string }[] = [];
  const positions: { id: string; page: number; x: number; y: number; height: number }[] = [];
  const body: string[] = [];
  const translations: typeof options = [];
  const earlierSteps: Line[] = [];
  let active = options;
  const hindi = /[\u0900-\u097f]/;
  for (const line of lines) {
    const matches = [...line.text.matchAll(label)];
    const first = matches[0];
    if (
      options.length >= 2 &&
      first?.index === 0 &&
      idOf(first) === 'A' &&
      hindi.test(line.text) &&
      !hindi.test(options[0].text)
    )
      active = translations;
    if (first?.index === 0 && idOf(first) === String.fromCharCode(65 + active.length)) {
      for (const [index, match] of matches.entries()) {
        const id = idOf(match);
        active.push({
          id,
          label: id,
          text: clean(line.text.slice(match.index! + match[0].length, matches[index + 1]?.index)),
        });
      }
      for (const item of line.items) {
        const first = [...item.text.trim().matchAll(label)][0];
        if (first?.index === 0)
          positions.push({
            id: idOf(first),
            page: line.page,
            x: item.x,
            y: item.y,
            height: item.height,
          });
      }
    } else if (
      active === options &&
      options.length >= 2 &&
      hindi.test(line.text) &&
      !hindi.test(options[0].text)
    ) {
      body.push(clean(line.text));
    } else if (options.length >= 3 && /^[-+]\d/.test(line.text)) {
      earlierSteps.push(line);
    } else if (active.length) active.at(-1)!.text += ' ' + clean(line.text);
    else body.push(clean(line.text));
  }
  const valid =
    options.length >= 2 &&
    options.every((o, i) => o.text.trim() && o.id === String.fromCharCode(65 + i));
  if (
    valid &&
    translations.length === options.length &&
    translations.every((o, i) => o.id === options[i].id)
  )
    for (const [i, translation] of translations.entries())
      options[i].text += '\n' + translation.text;
  return { options: valid ? options : [], stem: body.join('\n').trim(), positions, earlierSteps };
}

function green(color: string) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return false;
  const [r, g, b] = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  return g >= r + 22 && g >= b + 22;
}

function markedChoice(
  positions: ReturnType<typeof choicesOf>['positions'],
  graphics: Map<number, Graphics>,
) {
  const highlighted = positions.filter(({ page, x, y, height }) =>
    graphics
      .get(page)
      ?.fills.some(
        ({ bounds: [left, top, right, bottom], color }) =>
          green(color) &&
          bottom - top >= height * 0.55 &&
          bottom - top <= height * 2.4 &&
          x >= left - 1 &&
          x + height * 0.5 <= right &&
          y + height * 0.4 >= top &&
          y - height * 0.25 <= bottom,
      ),
  );
  const labels = [...new Set(highlighted.map((choice) => choice.id))];
  return labels.length === 1 ? labels[0] : undefined;
}

export async function workedQuestions(
  pages: PageData[],
  id: string,
  graphicsFor: (page: number) => Promise<Graphics>,
): Promise<
  | {
      bank: Bank;
      fragments: {
        number: number;
        part: string;
        page: number;
        pages: number[];
        context: string;
        text: string;
      }[];
      solutions: Map<number, NonNullable<MCQ['sourceSolution']>>;
    }
  | undefined
> {
  if (!pages.some((page) => page.text.split('\n').some((line) => solution.test(line)))) return;
  const rows: Row[] = [];
  const textPages = pages.map((page) => ({
    ...page,
    lines: positionedLines(mathItems(page.items)),
  }));
  const repeated = new Map<string, number>();
  for (const page of textPages) {
    const margin = new Set(
      page.lines
        .filter((line) => line.y < page.height * 0.08 || line.y > page.height * 0.92)
        .map((line) => line.text.replace(/\d+/g, '#')),
    );
    for (const text of margin) repeated.set(text, (repeated.get(text) ?? 0) + 1);
  }
  for (const page of textPages) {
    for (const raw of page.lines) {
      if (
        (raw.y < page.height * 0.08 || raw.y > page.height * 0.92) &&
        (repeated.get(raw.text.replace(/\d+/g, '#')) ?? 0) >= 3
      )
        continue;
      const line: Line = { ...raw, page: page.number };
      const current = rows.at(-1);
      const head = line.text.match(start);
      if (head && Number(head[1]) === (current?.number ?? 0) + 1) {
        rows.push({
          number: Number(head[1]),
          page: page.number,
          question: [{ ...line, text: head[2] || head[3] }],
          solution: [],
          worked: false,
        });
      } else if (current && solution.test(line.text)) {
        current.worked = true;
        current.solution.push({ ...line, text: line.text.replace(solution, '') });
      } else if (current) {
        (current.worked ? current.solution : current.question).push(line);
      }
    }
  }
  const parsed = rows.map((row) => ({ row, ...choicesOf(row.question) }));
  if (!parsed.some(({ options, row }) => options.length && row.worked)) return;
  const graphics = new Map<number, Graphics>();
  const optionPages = new Set(
    parsed.flatMap(({ row, positions }) => (row.worked ? positions.map((p) => p.page) : [])),
  );
  for (const page of optionPages) graphics.set(page, await graphicsFor(page));
  const marked = parsed.map(({ row, positions }) =>
    row.worked ? markedChoice(positions, graphics) : undefined,
  );
  const repeatedMarking = marked.filter(Boolean).length >= Math.min(2, parsed.length);
  const questions: MCQ[] = [];
  const study: Bank['study'] = [];
  const warnings: string[] = [];
  const fragments = [];
  const solutions = new Map<number, NonNullable<MCQ['sourceSolution']>>();
  for (const [i, { row, stem, options, earlierSteps }] of parsed.entries()) {
    const pageNumbers = [...new Set([...row.question, ...row.solution].map((line) => line.page))];
    const source = [...earlierSteps, ...row.solution].filter((line) => clean(line.text));
    const text = source
      .map((line) => clean(line.text))
      .join('\n')
      .slice(0, 18000);
    const sourceSolution = text && { text, pages: [...new Set(source.map((line) => line.page))] };
    if (sourceSolution) solutions.set(row.number, sourceSolution);
    fragments.push({
      number: row.number,
      part: '',
      page: row.page,
      pages: pageNumbers,
      context: '',
      text: `${row.number}. ${row.question.map((line) => clean(line.text)).join('\n')}${text ? '\nSolution: ' + text : ''}`,
    });
    const explicit = text
      .match(/(?:^|\n)(?:correct\s+)?(?:answer|option)\s*[:−–-]\s*\(?([A-H])\)?(?:[).\s]|$)/i)?.[1]
      .toUpperCase();
    const answer = explicit || (repeatedMarking ? marked[i] : undefined);
    if (
      !answer &&
      sourceSolution &&
      /(?:answer|find|calculate|determine)\s+the\s+following\s*:/i.test(stem)
    ) {
      study.push({
        id: `${id}-worked-${row.number}`,
        title: `Worked exercise ${row.number}`,
        text:
          row.question.map((line) => clean(line.text)).join('\n') +
          '\n\nWorked solution\n' +
          sourceSolution.text,
        hindi: '',
        page: row.page,
      });
      continue;
    }
    if (!stem || !options.some((option) => option.id === answer)) {
      warnings.push(
        `Question ${row.number}: check its options and worked answer (page ${row.page}).`,
      );
      continue;
    }
    questions.push({
      id: `${id}-q${row.number}`,
      number: row.number,
      stem,
      options,
      answerId: answer!,
      meaningHi: '',
      passage: '',
      page: row.page,
      pages: pageNumbers,
      origin: 'pdf',
      answerOrigin: 'pdf',
      evidence: explicit
        ? 'Answer stated in the original PDF'
        : 'Correct choice highlighted in the original PDF',
      explanation: '',
      ...(sourceSolution ? { sourceSolution } : {}),
    });
  }
  return {
    bank: { version: 1, id, kind: 'maths', questions, study, warnings },
    fragments,
    solutions,
  };
}
