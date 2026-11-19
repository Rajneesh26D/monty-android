import { useEffect, useRef, useState } from 'react';
import type { MCQ } from '../../shared/monty';
import { workedSolutionImages } from '../services/workedSolutionImage';
import { RichText } from './RichText';

export function WorkedSolution({
  question,
  attachmentId,
}: {
  question: MCQ;
  attachmentId?: string;
}) {
  const solution = question.sourceSolution!;
  const [images, setImages] = useState<Awaited<ReturnType<typeof workedSolutionImages>> | null>(
    null,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let current = true;
    void workedSolutionImages(question, attachmentId)
      .then((result) => {
        if (current) setImages(result);
      })
      .catch(() => {
        if (current) setImages([]);
      });
    return () => {
      current = false;
    };
  }, [question.id, question.number, question.page, solution, attachmentId]);
  const text = (
    <p>
      <RichText text={solution.text} />
    </p>
  );
  const figures = images?.map(({ page, url }, index) => (
    <figure key={`${page}-${index}`}>
      <img src={url} alt={`Worked solution from PDF page ${page}`} />
      <figcaption>PDF page {page}</figcaption>
    </figure>
  ));
  return (
    <div className="worked-solution">
      <strong>Worked solution from the PDF</strong>
      {images === null ? (
        <p role="status">Loading the original solution…</p>
      ) : images.length ? (
        <>
          {figures}
          <button className="text-button" type="button" onClick={() => dialog.current?.showModal()}>
            Enlarge solution
          </button>
          <details>
            <summary>Read as text</summary>
            {text}
          </details>
          <dialog
            ref={dialog}
            className="worked-solution-dialog"
            aria-label="Original worked solution"
          >
            <div className="worked-solution-toolbar">
              <strong>Original worked solution</strong>
              <form method="dialog">
                <button className="secondary">Close</button>
              </form>
            </div>
            <div className="worked-solution-scroll">{figures}</div>
          </dialog>
        </>
      ) : (
        <>
          {text}
          <small>
            {solution.pages.length === 1 ? 'Page' : 'Pages'} {solution.pages.join(', ')}
          </small>
        </>
      )}
    </div>
  );
}
