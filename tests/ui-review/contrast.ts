import { expect, type Page, type TestInfo } from '@playwright/test';
export async function review(page: Page, info: TestInfo, name: string) {
  const failures = await page.evaluate(() => {
    type RGBA = [number, number, number, number];
    const rgba = (s: string): RGBA => {
      const n = s.match(/[\d.]+/g)?.map(Number) || [];
      return [n[0] || 0, n[1] || 0, n[2] || 0, n.length > 3 ? n[3] : 1];
    };
    const blend = (fg: RGBA, bg: RGBA): RGBA => [
      fg[0] * fg[3] + bg[0] * (1 - fg[3]),
      fg[1] * fg[3] + bg[1] * (1 - fg[3]),
      fg[2] * fg[3] + bg[2] * (1 - fg[3]),
      1,
    ];
    const lum = (c: RGBA) =>
      c.slice(0, 3).reduce((sum, n, i) => {
        const v = n / 255;
        return (
          sum +
          [0.2126, 0.7152, 0.0722][i] * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
        );
      }, 0);
    const contrast = (a: RGBA, b: RGBA) => {
      const x = lum(a),
        y = lum(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const bg = (el: Element): RGBA => {
      const chain: Element[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e);
      let c: RGBA = [255, 255, 255, 1];
      for (const e of chain) c = blend(rgba(getComputedStyle(e).backgroundColor), c);
      return c;
    };
    const out: {
      text: string;
      element: string;
      color: string;
      background: string;
      ratio: number;
      required: number;
    }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode,
        el = node.parentElement,
        text = node.textContent?.trim();
      if (
        !el ||
        !text ||
        el.closest('script,style,option,[aria-hidden=true],.sr-only,button:disabled,input:disabled')
      )
        continue;
      const rect = el.getBoundingClientRect(),
        style = getComputedStyle(el);
      if (
        rect.width < 2 ||
        rect.height < 2 ||
        style.visibility !== 'visible' ||
        style.display === 'none' ||
        el.closest('dialog:not([open])')
      )
        continue;
      // Hidden screens and clipped accessibility labels have no rendered text boxes.
      const range = document.createRange();
      range.selectNodeContents(node);
      if (!range.getClientRects().length) continue;
      let opacity = 1;
      for (let a: Element | null = el; a; a = a.parentElement)
        opacity *= Number(getComputedStyle(a).opacity);
      if (opacity === 0) continue;
      const background = bg(el),
        foreground = rgba(style.color);
      foreground[3] *= opacity;
      const ratio = contrast(blend(foreground, background), background),
        size = parseFloat(style.fontSize),
        bold = Number(style.fontWeight) >= 700;
      const required = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      if (ratio + 0.05 < required)
        out.push({
          text: text.slice(0, 90),
          element: el.tagName.toLowerCase() + '.' + el.className,
          color: style.color,
          background: background.slice(0, 3).map(Math.round).join(','),
          ratio: Math.round(ratio * 100) / 100,
          required,
        });
    }
    return out;
  });
  await page.screenshot({ path: info.outputPath(name + '.png'), fullPage: true });
  await info.attach(name + '-contrast', {
    body: JSON.stringify(failures, null, 2),
    contentType: 'application/json',
  });
  expect.soft(failures, name + ' contains low-contrast text').toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
  expect.soft(overflow, name + ' has horizontal overflow').toBe(false);
}
