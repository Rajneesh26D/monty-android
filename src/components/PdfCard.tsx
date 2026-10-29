import type { ReactNode } from 'react';
import { Pencil, Pin, Trash2 } from 'lucide-react';

export function PdfCard({
  name,
  summary,
  pinned,
  disabled,
  onRename,
  onPin,
  onDelete,
  children,
}: {
  name: string;
  summary: ReactNode;
  pinned?: boolean;
  disabled?: boolean;
  onRename: () => void;
  onPin: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  return (
    <article className="document-card">
      <div className="card-heading">
        <div>
          <h2>{name}</h2>
          <p className="muted">{summary}</p>
        </div>
        <div className="actions">
          <button
            className="icon-button"
            disabled={disabled}
            aria-label={`Rename ${name}`}
            onClick={onRename}
          >
            <Pencil size={15} />
          </button>
          <button
            className="icon-button"
            disabled={disabled}
            aria-label={`${pinned ? 'Unpin' : 'Pin'} ${name}`}
            onClick={onPin}
          >
            <Pin size={15} fill={pinned ? 'currentColor' : 'none'} />
          </button>
          <button
            className="icon-button delete"
            disabled={disabled}
            aria-label={`Delete PDF ${name}`}
            onClick={onDelete}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      {children}
    </article>
  );
}
