import type { Bank, MCQ } from '../../shared/monty';
import { linesOf, type PageData, type TextItem } from './parser';
// Source MCQs share an extractor across subject folders. Answer sheets are
// collected separately from question columns, including mixed-content pages.
type Row = { number: number; lines: string[]; page: number; pages: number[]; direction?: string };
const normal = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();
const index = (label: string) =>
  /^[1-8]$/.test(label) ? Number(label) - 1 : label.toUpperCase().charCodeAt(0) - 65;
const option = /^(?:\(([A-Ha-h1-8])\)|([A-Ha-h1-8])[):.])\s*(.*)$/;
export class QuestionParser {
  private rows: Row[] = [];
  private keys = new Map<number, string>();
  private explanations = new Map<number, string[]>();
  private answerPage = false;
  private activeKey: number | undefined;
  private problems: string[] = [];
  private direction = '';
  private awaitingQuestion = false;
  add(page: PageData) {
    const items = page.items
      .filter((i) => i.y > 25 && i.y < page.height - 25)
      .map((i) => ({ ...i, text: i.text.normalize('NFKC') }));
    const marker = items.find((i) =>
      /^(?:answers?(?:\s*key)?|solutions?|उत्तर\s*कुंजी)$/i.test(i.text.trim()),
    );
    const keyY = marker?.y ?? (this.answerPage ? 0 : Infinity);
    const columns = (source: TextItem[]) => {
      const middle = page.width / 2;
      const crossing = source.filter(
        (i) => i.x < page.width * 0.4 && i.x + i.width > page.width * 0.58,
      ).length;
      const left = source.filter((i) => i.x < middle),
        right = source.filter((i) => i.x >= middle);
      const heads = source.filter((i) => /^\d+[.)]$/.test(i.text.trim()));
      const paired =
        heads.some((i) => i.x < page.width * 0.25) && heads.some((i) => i.x > page.width * 0.48);
      return (paired || crossing < 3) && left.length > 5 && right.length > 5
        ? [left, right]
        : [source];
    };
    const questionItems = items.filter((i) => i.y < keyY - 2);
    for (const column of columns(questionItems))
      for (const line of linesOf(column)) {
        if (/^(?:find the|choose the|read.*passage|directions?\s*[:.])/i.test(line)) {
          this.direction = line;
          this.awaitingQuestion = true;
          continue;
        }
        if (/^(?:class\s*:)/i.test(line)) continue;
        const inlineKey = line.match(/^(\d+)[.)]\s*Ans(?:wer)?\s*[:.−–-]*\s*([A-Ha-h1-8])\b/i);
        if (inlineKey) {
          this.key(Number(inlineKey[1]), inlineKey[2]);
          continue;
        }
        const last = this.rows.at(-1);
        const head = line.match(/^(?:Q(?:uestion)?\s*[.:]?\s*)?(\d{1,4})[.)]\s*(.*)$/i);
        // Numeric choice lists must remain options even when a choice number is
        // also the next question number. Sequential labels provide that evidence.
        const already = last ? this.choices(last).length : 0;
        const choice = line.match(option);
        const delimiter = (text: string) =>
          text.trim().startsWith('(')
            ? 'brackets'
            : (text.trim().match(/^[A-Ha-h1-8]([):.])/)?.[1] ?? '');
        const firstChoice = last?.lines.find((text) => option.test(text));
        const numericChoice =
          last &&
          choice &&
          /^\d$/.test(choice[1] || choice[2]) &&
          index(choice[1] || choice[2]) === already &&
          already < 8 &&
          (!head || delimiter(line) === delimiter(firstChoice || ''));
        if (head && !numericChoice && (!last || Number(head[1]) > last.number)) {
          this.awaitingQuestion = false;
          this.rows.push({
            direction: this.direction,
            number: Number(head[1]),
            lines: head[2] ? [head[2]] : [],
            page: page.number,
            pages: [page.number],
          });
        } else if (this.awaitingQuestion) {
          this.direction += ' ' + line;
        } else if (last) {
          last.lines.push(line);
          if (!last.pages.includes(page.number)) last.pages.push(page.number);
        }
      }
    if (marker || this.answerPage) {
      this.answerPage = true;
      for (const column of columns(items.filter((i) => i.y >= keyY)))
        for (const line of linesOf(column)) {
          const answer = line.match(/^(\d+)[.)]\s*Ans(?:wer)?\s*[:.−–-]*\s*([A-Ha-h1-8])\b/i);
          if (answer) {
            this.activeKey = Number(answer[1]);
            this.key(this.activeKey, answer[2]);
          } else if (this.activeKey && !/^(?:answers?|solutions?)$/i.test(line)) {
            const stored = this.explanations.get(this.activeKey) || [];
            stored.push(line);
            this.explanations.set(this.activeKey, stored);
          }
        }
    }
  }
  private key(number: number, label: string) {
    const answer = String.fromCharCode(65 + index(label));
    if (this.keys.has(number) && this.keys.get(number) !== answer)
      this.problems.push(`Conflicting answer for question ${number}.`);
    else this.keys.set(number, answer);
  }
  private choices(row: Row) {
    return row.lines.flatMap((line) => {
      const m = line.match(option);
      return m
        ? [
            {
              id: String.fromCharCode(65 + index(m[1] || m[2])),
              label: (m[1] || m[2]).toUpperCase(),
              text: m[3],
            },
          ]
        : [];
    });
  }
  hasChoices() {
    return this.rows.some(
      (row) =>
        this.choices(row).length >= 2 ||
        [...row.lines.join(' ').matchAll(/[\p{L}]+\([a-h]\)/gu)].length >= 2,
    );
  }
  recoveryFragments() {
    return this.rows.map((row) => ({
      number: row.number,
      part: '',
      page: row.page,
      pages: row.pages,
      context: row.direction || '',
      text: `${row.number}. ${row.lines.join('\n')}`,
    }));
  }
  sourceAnswers() {
    return Array.from(this.keys, ([number, answerId]) => ({ number, part: '', answerId }));
  }
  inventory() {
    return this.rows.map((row) => ({ number: row.number, page: row.page }));
  }
  finish(id: string): Bank {
    const questions: MCQ[] = [],
      warnings = [...this.problems];
    for (const row of this.rows) {
      const choices: { id: string; label: string; text: string }[] = [];
      let stem: string;
      const body: string[] = [];
      for (const line of row.lines) {
        const m = line.match(option);
        if (m)
          choices.push({
            id: String.fromCharCode(65 + index(m[1] || m[2])),
            label: (m[1] || m[2]).toUpperCase(),
            text: m[3],
          });
        else if (choices.length) choices.at(-1)!.text += ' ' + line;
        else body.push(line);
      }
      if (choices.length) {
        stem = normal(body.join(' '));
      } else {
        const original = normal(row.lines.join(' '));
        const matches = [...original.matchAll(/([\p{L}][\p{L}'’-]*)\s*\(([a-h])\)/gu)];
        const valid =
          matches.length >= 2 &&
          matches.every(
            (m, i) =>
              index(m[2]) === i &&
              (i === 0 ||
                /^\s*\/\s*$/.test(
                  original.slice(matches[i - 1].index! + matches[i - 1][0].length, m.index),
                )),
          );
        if (valid) {
          for (const m of matches)
            choices.push({ id: m[2].toUpperCase(), label: m[2].toUpperCase(), text: m[1] });
          stem =
            original.slice(0, matches[0].index) +
            '_____ ' +
            original.slice(matches.at(-1)!.index! + matches.at(-1)![0].length).trim();
          stem = stem.replace(/\s+([.,;!?])/g, '$1');
        } else stem = original;
      }
      const answer = this.keys.get(row.number);
      if (
        !stem ||
        choices.length < 2 ||
        !answer ||
        !choices.some((o) => o.id === answer) ||
        choices.some((o) => !o.text.trim()) ||
        new Set(choices.map((o) => o.id)).size !== choices.length ||
        choices.some((o, i) => o.id !== String.fromCharCode(65 + i))
      ) {
        warnings.push(
          `Question ${row.number}: check its options and answer key (page ${row.page}).`,
        );
        continue;
      }
      questions.push({
        id: `${id}-q${row.number}`,
        number: row.number,
        stem,
        meaningHi: '',
        passage: row.direction || '',
        options: choices.map((o) => ({ ...o, text: normal(o.text) })),
        answerId: answer,
        page: row.page,
        pages: row.pages,
        origin: 'pdf',
        answerOrigin: 'pdf',
        evidence: 'Answer and choices from the original PDF',
        explanation: normal((this.explanations.get(row.number) || []).join(' ')).replace(
          /^Explanation\s*[-:]\s*/i,
          '',
        ),
      });
    }
    const missing = [...this.keys.keys()].filter((n) => !this.rows.some((r) => r.number === n));
    if (missing.length) warnings.push(`Could not locate questions: ${missing.join(', ')}.`);
    return { version: 1, id, kind: 'general', questions, study: [], warnings };
  }
}
