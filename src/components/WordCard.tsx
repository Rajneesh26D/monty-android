import { Bookmark, Pencil, Sparkles } from 'lucide-react';
import type { Entry } from '../../shared/types';
export function BookmarkButton({ saved, onClick }: { saved: boolean; onClick: () => void }) {
  return (
    <button
      className={'icon-button bookmark ' + (saved ? 'saved' : '')}
      aria-label={saved ? 'Remove bookmark' : 'Bookmark word'}
      aria-pressed={saved}
      onClick={onClick}
    >
      <Bookmark size={21} fill={saved ? 'currentColor' : 'none'} />
    </button>
  );
}
export function WordCard({
  entry,
  saved,
  onBookmark,
  onEdit,
}: {
  entry: Entry;
  saved: boolean;
  onBookmark: () => void;
  onEdit?: () => void;
}) {
  return (
    <article className="word-card">
      <div className="card-heading">
        <h2>{entry.word}</h2>
        <div className="actions">
          {onEdit && (
            <button className="icon-button" aria-label={`Edit ${entry.word}`} onClick={onEdit}>
              <Pencil size={17} />
            </button>
          )}
          <BookmarkButton saved={saved} onClick={onBookmark} />
        </div>
      </div>
      <div className="meaning">
        <h3>Meaning</h3>
        <p>{entry.meaningEn || <span className="muted">Not provided</span>}</p>
        <p lang="hi" className="hindi">
          {entry.meaningHi || <span className="muted">Hindi meaning pending</span>}
        </p>
      </div>
      <div className="memory">
        <h3>
          Memory trick{' '}
          {entry.origins.mnemonic === 'ai' && <Sparkles size={12} aria-label="AI supplied" />}
        </h3>
        <p>{entry.mnemonic || <span className="muted">Pending</span>}</p>
      </div>
      <div className="relation-group synonyms">
        <h3>Synonyms</h3>
        <div className="chips">
          {entry.synonyms.length ? (
            entry.synonyms.map((r) => <span key={r.term}>{r.term}</span>)
          ) : (
            <span className="muted">Pending</span>
          )}
        </div>
      </div>
      <div className="relation-group antonyms">
        <h3>Antonyms</h3>
        <div className="chips">
          {entry.antonyms.length ? (
            entry.antonyms.map((r) => <span key={r.term}>{r.term}</span>)
          ) : (
            <span className="muted">Pending</span>
          )}
        </div>
      </div>
      <div className="example">
        <h3>Example</h3>
        <p>{entry.example || <span className="muted">Pending</span>}</p>
      </div>
    </article>
  );
}
