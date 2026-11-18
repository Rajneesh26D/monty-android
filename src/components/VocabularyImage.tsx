import { useEffect, useRef, useState } from 'react';
import type { Entry } from '../../shared/types';
import { vocabularyImage } from '../services/vocabularyImage';

export function VocabularyImage({ word, sources }: Pick<Entry, 'word' | 'sources'>) {
  const node = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    if (!node.current || !sources.length) return;
    let active = true;
    setImage(null);
    const load = async () => {
      for (const source of sources) {
        const result = await vocabularyImage(word, source);
        if (!active) return;
        if (result) {
          setImage(result);
          return;
        }
      }
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver(
            (entries) => {
              if (!entries.some((entry) => entry.isIntersecting)) return;
              observer?.disconnect();
              void load();
            },
            { rootMargin: '160px' },
          );
    if (observer) observer.observe(node.current);
    else void load();
    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [word, sources]);
  if (!sources.length) return null;
  return (
    <div ref={node} className="vocabulary-image">
      {image && <img src={image} alt={`Illustration from the PDF for ${word}`} />}
    </div>
  );
}
