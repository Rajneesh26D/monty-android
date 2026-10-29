import { useRef, useState } from 'react';
import { Upload, Pin, Pencil, Trash2, FileText } from 'lucide-react';
import type { State } from '../../shared/types';
import type { Commit } from '../services/importer';
import { addNote } from '../services/workspace';
import { removeAttachment } from '../storage/repository';
import { FileViewer } from './FileViewer';
import { isPdf, openPdfInApp } from '../services/openPdf';
export function NotesPanel({
  folderId,
  state,
  commit,
  notify,
}: {
  folderId: string;
  state: State;
  commit: Commit;
  notify: (s: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    [busy, setBusy] = useState(false),
    [opened, setOpened] = useState<string | null>(null);
  const notes = Object.values(state.monty!.attachments)
      .filter((a) => a.folderId === folderId && a.kind === 'note')
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt),
    note = notes.find((n) => n.id === opened);
  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save file.');
    }
  }
  return (
    <section>
      <div className="page-heading">
        <h1>Notes</h1>
        <button className="primary" disabled={busy} onClick={() => input.current?.click()}>
          <Upload size={17} /> Add notes
        </button>
      </div>
      <input
        ref={input}
        hidden
        type="file"
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          setBusy(true);
          void act(async () => {
            for (const file of files) await addNote(file, folderId, commit);
          }).finally(() => setBusy(false));
        }}
      />
      {busy && <p role="status">Saving notes…</p>}
      {!notes.length && (
        <div className="empty-state">
          <FileText size={30} />
          <h2>No notes yet</h2>
          <p>Upload PDFs, images or other study files.</p>
        </div>
      )}
      {notes.map((n) => (
        <article className="attachment-card" key={n.id}>
          <button
            className="file-open"
            onClick={() => {
              if (isPdf(n.name, n.mime)) void openPdfInApp(n, notify);
              else setOpened(n.id);
            }}
          >
            <FileText size={22} />
            <span>
              <strong>{n.name}</strong>
              <small>
                {(n.size / 1024 / 1024).toFixed(1)} MB{n.pinned ? ' · Pinned' : ''}
              </small>
            </span>
          </button>
          <div className="actions">
            <button
              className="icon-button"
              aria-label={`Rename ${n.name}`}
              onClick={() => {
                const name = prompt('Rename note', n.name)?.trim();
                if (name)
                  void act(() =>
                    commit((s) => ({
                      ...s,
                      monty: {
                        ...s.monty!,
                        attachments: {
                          ...s.monty!.attachments,
                          [n.id]: { ...s.monty!.attachments[n.id], name },
                        },
                      },
                    })),
                  );
              }}
            >
              <Pencil size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={`${n.pinned ? 'Unpin' : 'Pin'} ${n.name}`}
              aria-pressed={n.pinned}
              onClick={() =>
                void act(() =>
                  commit((s) => ({
                    ...s,
                    monty: {
                      ...s.monty!,
                      attachments: {
                        ...s.monty!.attachments,
                        [n.id]: { ...s.monty!.attachments[n.id], pinned: !n.pinned },
                      },
                    },
                  })),
                )
              }
            >
              <Pin size={16} fill={n.pinned ? 'currentColor' : 'none'} />
            </button>
            <button
              className="icon-button delete"
              aria-label={`Delete note ${n.name}`}
              onClick={() => {
                if (confirm(`Permanently delete “${n.name}”?`))
                  void act(async () => {
                    await commit((s) => {
                      const attachments = { ...s.monty!.attachments };
                      delete attachments[n.id];
                      return { ...s, monty: { ...s.monty!, attachments } };
                    });
                    await removeAttachment(n.id);
                  });
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </article>
      ))}
      {note && (
        <FileViewer
          id={note.id}
          name={note.name}
          mime={note.mime}
          onClose={() => setOpened(null)}
        />
      )}
    </section>
  );
}
