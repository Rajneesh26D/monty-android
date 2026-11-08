import type { ArticleBlock } from '../../shared/reading';
export function articleFromText(source: string): ArticleBlock[] {
  if (source.length > 2_000_000) throw new Error('Import an article smaller than 2 MB.');
  const blocks = source
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n\s*\n/)
    .map((text) => ({ kind: 'paragraph' as const, text: text.trim() }))
    .filter((b) => b.text);
  if (!blocks.length) throw new Error('Add some article text first.');
  return blocks;
}
// Only plain text leaves the inert template. No imported HTML enters the live DOM.
export function articleFromHTML(source: string): { title: string; blocks: ArticleBlock[] } {
  if (source.length > 2_000_000) throw new Error('Import an article smaller than 2 MB.');
  const template = document.createElement('template');
  template.innerHTML = source;
  const root = template.content;
  const title =
    root.querySelector('h1')?.textContent?.trim() ||
    root.querySelector('title')?.textContent?.trim() ||
    '';
  root
    .querySelectorAll(
      'script,style,iframe,object,embed,svg,math,template,noscript,nav,header,footer,form,button,input,textarea,select,img,video,audio,link,meta,title',
    )
    .forEach((el) => el.remove());
  const main =
    root.querySelector('article') ||
    root.querySelector('main') ||
    root.querySelector('body') ||
    root;
  const blocks: ArticleBlock[] = [];
  let pending = '';
  const flush = (kind: ArticleBlock['kind'] = 'paragraph') => {
    const text = pending
      .replace(/[\t\r ]+/g, ' ')
      .replace(/\n\s*/g, '\n')
      .trim();
    if (text) blocks.push({ kind, text });
    pending = '';
  };
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      pending += node.textContent || '';
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.tagName === 'BR') {
      pending += '\n';
      return;
    }
    const boundary = /^(P|DIV|SECTION|ARTICLE|MAIN|H[1-6]|LI|BLOCKQUOTE|TR|UL|OL|PRE)$/.test(
      node.tagName,
    );
    if (boundary) flush();
    node.childNodes.forEach(visit);
    if (boundary)
      flush(
        /^H[1-6]$/.test(node.tagName)
          ? 'heading'
          : node.tagName === 'BLOCKQUOTE'
            ? 'quote'
            : 'paragraph',
      );
  };
  main.childNodes.forEach(visit);
  flush();
  if (!blocks.length) throw new Error('No readable article text was found in this HTML.');
  return { title: title.slice(0, 200), blocks };
}
export function wordTokens(text: string) {
  return text.split(/([A-Za-z]+(?:['’\-][A-Za-z]+)*)/g);
}
export function wordContext(text: string, index: number, length: number) {
  return text.slice(Math.max(0, index - 450), Math.min(text.length, index + length + 450)).trim();
}
