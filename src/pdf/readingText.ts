import { linesOf, type PageData } from './parser';
export function readingText(page: PageData) {
  const items = page.items.filter((i) => i.text.trim()),
    middle = page.width / 2;
  const crossing = items.filter(
    (i) => i.x < page.width * 0.4 && i.x + i.width > page.width * 0.58,
  ).length;
  const left = items.filter((i) => i.x < middle),
    right = items.filter((i) => i.x >= middle);
  const columns = crossing < 3 && left.length > 15 && right.length > 15;
  return columns
    ? [linesOf(left).join('\n'), linesOf(right).join('\n')].join('\n\nNEXT COLUMN\n\n')
    : page.text;
}
