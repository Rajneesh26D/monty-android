import { useEffect, useState, type RefObject } from 'react';
import type { Entry } from '../../shared/types';
import { vocabularyImage } from '../services/vocabularyImage';

type Props = Pick<Entry, 'word' | 'sources'> & {
  card: RefObject<HTMLElement | null>;
  sourceDocumentId?: string;
};

export function VocabularyImage({ word, sources, card, sourceDocumentId }: Props) {
  const [image, setImage] = useState<{ url: string; page: number } | null>(null);
  useEffect(() => {
    const element = card.current;
    const references = sourceDocumentId
      ? sources.filter((source) => source.documentId === sourceDocumentId)
      : sources;
    setImage(null);
    if (!element || !references.length) return;
    let active = true;
    let loading = false;
    let loaded = false;
    let nearViewport = typeof IntersectionObserver === 'undefined';
    const load = async () => {
      if (!nearViewport || loading || loaded) return;
      loading = true;
      try {
        for (const source of references) {
          const url = await vocabularyImage(word, source);
          if (!active) return;
          if (url) {
            loaded = true;
            setImage({ url, page: source.page });
            return;
          }
        }
      } finally {
        loading = false;
      }
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver(
            (entries) => {
              nearViewport = entries.some((entry) => entry.isIntersecting);
              if (nearViewport) void load();
            },
            { rootMargin: '160px' },
          );
    if (observer) observer.observe(element);
    else void load();
    window.addEventListener('online', load);
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener('online', load);
    };
  }, [word, sources, card, sourceDocumentId]);

  if (!image) return null;
  return (
    <figure className="vocabulary-image">
      <img src={image.url} alt={`Illustration from the PDF for ${word}`} />
      <figcaption>PDF page {image.page}</figcaption>
    </figure>
  );
}
