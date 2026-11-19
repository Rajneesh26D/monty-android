import type { MCQ, Bank } from '../../shared/monty';
import { mathItems } from './content';
import type { Bounds, Graphics } from './graphics';
import { positionedLines, type PageData } from './parser';

type Line = ReturnType<typeof positionedLines>[number] & { page: number };
type Row = { number: number; page: number; question: Line[]; solution: Line[]; worked: boolean };
const start = /^(?:Q(?:uestion)?\s*[.:]?\s*)?(\d{1,4})[.)](?:\s+(\S.*)|([^\d\s].*))$/i;
const solution = /^(?:worked\s+solution|solution|sol\.)\s*(?:[:.−–—-]\s*|$)/i;
const label = /(?:^|\s)(?:\(([A-H])\)|([A-H])[)\.])\s*/gi;
const clean = (text: string) => text.replace(/[\u0000]/g, '').trim();
const idOf = (m: RegExpMatchArray) => (m[1] || m[2]).toUpperCase();
const equation = /[=≈].*[\p{L}\p{N}]/u;

// Some worksheets start the calculation beside the final choice, then print
// the solution label on the next line. Keep the original text coordinates
// until the last choice and the calculation have been separated.
function openingSteps(row: Row) {
  const marker = row.solution[0];
  if (!marker) return { question: row.question, steps: [] as Line[] };
  let at = row.question.length - 1;
  for (; at >= 0; at--) {
    const line = row.question[at];
    const first = [...line.text.matchAll(label)][0];
    if (first?.index === 0 && line.page === marker.page) break;
  }
  const choices = row.question[at];
  if (!choices || marker.y - choices.y > 3 * (choices.items[0]?.height || 12))
    return { question: row.question, steps: [] as Line[] };

  const firstStep = (candidate: Line, optionText: string, right: number, font?: string) => {
    const first = candidate.items[0];
    const lastLabel = [...optionText.matchAll(label)].at(-1);
    if (
      !first ||
      !lastLabel ||
      !optionText.slice(lastLabel.index! + lastLabel[0].length).trim() ||
      [...candidate.text.matchAll(label)].length
    )
      return false;
    const height = first.height || 12;
    if (first.x - right < 1.5 * height || !equation.test(candidate.text)) return false;
    return (
      (!!first.fontName && !!font && first.fontName !== font) ||
      row.solution.some(
        (line) =>
          line.page === candidate.page &&
          line.items.some((item) => Math.abs(item.x - first.x) <= height * 0.6),
      )
    );
  };
  const rightEdge = (items: Line['items']) => Math.max(...items.map((i) => i.x + i.width));
  const following = row.question.slice(at + 1);
  const lastItem = choices.items.at(-1);
  if (
    following.length &&
    lastItem &&
    following.every((line) => line.page === marker.page && equation.test(line.text)) &&
    firstStep(following[0], choices.text, rightEdge(choices.items), lastItem.fontName)
  )
    return { question: row.question.slice(0, at + 1), steps: following };
  if (!following.length) {
    for (let i = 1; i < choices.items.length; i++) {
      const left = choices.items.slice(0, i),
        right = choices.items.slice(i);
      const [optionLine] = positionedLines(left),
        [stepLine] = positionedLines(right);
      if (
        optionLine &&
        stepLine &&
        firstStep(
          { ...stepLine, page: choices.page },
          optionLine.text,
          rightEdge(left),
          left.at(-1)?.fontName,
        )
      ) {
        return {
          question: [...row.question.slice(0, at), { ...optionLine, page: choices.page }],
          steps: [{ ...stepLine, page: choices.page }],
        };
      }
    }
  }
  return { question: row.question, steps: [] as Line[] };
}

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

function workedRows(pages: PageData[]): Row[] {
  if (!pages.some((page) => page.text.split('\n').some((line) => solution.test(line)))) return [];
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
  return rows;
}

export type SolutionRegion = { page: number; bounds: Bounds };
export type SolutionRegionIndex = Record<string, SolutionRegion[]>;

function sourceSolutionOf(lines: Line[]): MCQ['sourceSolution'] {
  const source = lines.filter((line) => clean(line.text));
  const text = source
    .map((line) => clean(line.text))
    .join('\n')
    .slice(0, 18000);
  return text ? { text, pages: [...new Set(source.map((line) => line.page))] } : undefined;
}

export function repairWorkedChoices(bank: Bank, pages: PageData[]): Bank {
  const fixes = new Map<
    string,
    {
      before: ReturnType<typeof choicesOf>;
      after: ReturnType<typeof choicesOf>;
      previousSolution: MCQ['sourceSolution'];
      solution: MCQ['sourceSolution'];
    }
  >();
  for (const row of workedRows(pages)) {
    const { question, steps } = openingSteps(row);
    if (!steps.length) continue;
    const before = choicesOf(row.question),
      after = choicesOf(question);
    if (!before.options.length || before.options.length !== after.options.length) continue;
    fixes.set(`${row.page}-${row.number}`, {
      before,
      after,
      previousSolution: sourceSolutionOf([...before.earlierSteps, ...row.solution]),
      solution: sourceSolutionOf([...after.earlierSteps, ...steps, ...row.solution]),
    });
  }
  return {
    ...bank,
    questions: bank.questions.map((question) => {
      const fix = fixes.get(`${question.page}-${question.number}`);
      if (!fix || question.sourcePart || question.options.length !== fix.after.options.length)
        return question;
      let changed = false;
      const options = question.options.map((option, i) => {
        const before = fix.before.options[i],
          after = fix.after.options[i];
        if (option.id !== before.id || option.text !== before.text || option.text === after.text)
          return option;
        changed = true;
        return { ...option, text: after.text };
      });
      if (!changed) return question;
      const sourceSolution =
        !question.sourceSolution || question.sourceSolution.text === fix.previousSolution?.text
          ? fix.solution
          : question.sourceSolution;
      return { ...question, options, sourceSolution };
    }),
  };
}

export function workedSolutionRegions(pages: PageData[]): SolutionRegionIndex {
  const regions: SolutionRegionIndex = {};
  const pageByNumber = new Map(pages.map((page) => [page.number, page]));
  for (const row of workedRows(pages)) {
    if (!row.worked) continue;
    const { question, steps } = openingSteps(row);
    const byPage = new Map<number, typeof row.solution>();
    for (const line of [...choicesOf(question).earlierSteps, ...row.solution]) {
      const group = byPage.get(line.page) ?? [];
      group.push(line);
      byPage.set(line.page, group);
    }
    const groups: [number, Line[]][] = steps.length
      ? [[steps[0].page, steps], ...byPage]
      : [...byPage];
    regions[`${row.page}-${row.number}`] = groups.flatMap(([number, lines]) => {
      const page = pageByNumber.get(number)!;
      const items = lines.flatMap((line) => line.items).filter((item) => item.text.trim());
      if (!items.length) return [];
      const firstBaseline = Math.min(...lines.map((line) => line.y));
      const previousBaseline = Math.max(
        0,
        ...(lines === steps
          ? []
          : [...question, ...steps]
              .filter((line) => line.page === number && line.y < firstBaseline - 3)
              .map((line) => line.y + 2)),
      );
      const bounds: Bounds = [
        Math.max(0, Math.min(...items.map((item) => item.x)) - 7),
        Math.max(previousBaseline, Math.min(...items.map((item) => item.y - item.height)) - 4),
        Math.min(page.width, Math.max(...items.map((item) => item.x + item.width)) + 8),
        Math.min(page.height, Math.max(...items.map((item) => item.y + item.height * 0.3)) + 5),
      ];
      return bounds[2] > bounds[0] && bounds[3] > bounds[1] ? [{ page: number, bounds }] : [];
    });
  }
  return regions;
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
  const rows = workedRows(pages);
  const parsed = rows.map((row) => {
    const { question, steps } = openingSteps(row);
    return {
      row: { ...row, question, solution: [...steps, ...row.solution] },
      ...choicesOf(question),
    };
  });
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
    const sourceSolution = sourceSolutionOf([...earlierSteps, ...row.solution]);
    const text = sourceSolution?.text ?? '';
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
