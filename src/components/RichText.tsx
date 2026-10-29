import { Fragment } from 'react';
export function RichText({ text }: { text: string }) {
  return (
    <span className="rich-text">
      {text.split(/(\[\[frac:[^\]]+\]\])/g).map((part, i) => {
        const m = part.match(/^\[\[frac:([^/]+)\/(.+)\]\]$/);
        return m ? (
          <span key={i} className="fraction" aria-label={m[1] + ' divided by ' + m[2]}>
            <span>{m[1]}</span>
            <span>{m[2]}</span>
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        );
      })}
    </span>
  );
}
