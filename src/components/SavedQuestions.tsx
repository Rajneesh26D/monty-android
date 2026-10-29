import { StudyContent } from './StudyContent';
import { useEffect, useState } from 'react';
import type { Bank, MCQ, StudyItem } from '../../shared/monty';
import { readBank } from '../services/workspace';
import { MCQView } from './MCQView';
export const questionRef = (bankId: string, id: string, study = false) =>
  bankId + '|' + (study ? 's' : 'q') + '|' + id;
export function SavedQuestions({
  refs,
  onRemove,
  onBack,
}: {
  refs: string[];
  onRemove: (ref: string) => void;
  onBack?: () => void;
}) {
  const [items, setItems] = useState<{ ref: string; bank: Bank; q?: MCQ; s?: StudyItem }[]>([]),
    [error, setError] = useState(''),
    [revealed, setRevealed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let active = true;
    void Promise.all(
      refs.map(async (ref) => {
        const [id, type, key] = ref.split('|');
        const bank = await readBank(id);
        return {
          ref,
          bank,
          q: type === 'q' ? bank.questions.find((q) => q.id === key) : undefined,
          s:
            type === 's' || bank.kind === 'idioms'
              ? bank.study.find((s) => s.id === key)
              : undefined,
        };
      }),
    )
      .then((x) => {
        if (active) setItems(x);
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, [refs.join(',')]);
  return (
    <section>
      {onBack && (
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
      )}
      <div className="page-heading">
        <h1>Bookmarks</h1>
        <span className="count-badge">{refs.length}</span>
      </div>
      {error && <p role="alert">{error}</p>}
      {!refs.length && (
        <div className="empty-state">
          <h2>No bookmarks yet</h2>
          <p>Save a question or study card to find it here.</p>
        </div>
      )}
      {items.map((item) => (
        <article className="word-card" key={item.ref}>
          <div className="card-heading">
            <span className="eyebrow">{item.q ? 'Question ' + item.q.number : 'Study card'}</span>
            <button className="text-button" onClick={() => onRemove(item.ref)}>
              Remove bookmark
            </button>
          </div>
          {item.s && (
            <>
              <h2>{item.s.title}</h2>
              <StudyContent item={item.s} />
            </>
          )}
          {item.q && !item.s && (
            <>
              <MCQView
                maths={item.bank.kind === 'maths'}
                question={item.q}
                reveal={!!revealed[item.ref]}
                disabled={!revealed[item.ref]}
                onSelect={() => {}}
              />
              {!revealed[item.ref] && (
                <button
                  className="secondary"
                  onClick={() => setRevealed((r) => ({ ...r, [item.ref]: true }))}
                >
                  Show answer
                </button>
              )}
            </>
          )}
        </article>
      ))}
    </section>
  );
}
