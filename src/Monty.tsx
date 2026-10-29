import { useState, useEffect } from 'react';
import {
  NotebookPen,
  Calculator,
  BookOpen,
  ArrowLeft,
  Plus,
  Folder as FolderIcon,
  Pin,
  Pencil,
  Trash2,
  Settings as SettingsIcon,
  X,
  ChevronRight,
} from 'lucide-react';
import { useStore } from './storage/useStore';
import { scopedStore } from './storage/scoped';
import type { Area, Folder } from '../shared/monty';
import { uid } from '../shared/types';
import VocabApp from './App';
import { StudyFolder } from './components/StudyFolder';
import { NotesPanel } from './components/NotesPanel';
import { CloudStatus } from './components/CloudStatus';
import { Settings } from './components/Settings';
import { removeAttachment, removePdf } from './storage/repository';
import { initializeUpdates } from './services/updates';
const labels: Record<Area, string> = {
  maths: 'Maths',
  vocab: 'Vocab',
  grammar: 'Grammar',
  reading: 'PQRS / RS / CT / RC',
};
export default function Monty() {
  const store = useStore(),
    { state, commit, current, error } = store;
  const [subject, setSubject] = useState<'english' | 'maths' | null>(null),
    [area, setArea] = useState<Area | null>(null),
    [folderId, setFolderId] = useState<string | null>(null),
    [settings, setSettings] = useState(false),
    [toast, setToast] = useState(''),
    [creating, setCreating] = useState(false),
    [folderName, setFolderName] = useState(''),
    [profile, setProfile] = useState<Folder['profile']>('auto');
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void initializeUpdates(() => setSettings(true))
      .then((remove) => {
        if (disposed) remove();
        else cleanup = remove;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(''), 9000);
  };
  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save the change.');
    }
  }
  if (!state || !state.monty)
    return (
      <div className="loading">
        <span className="brand-mark">
          <NotebookPen size={29} />
        </span>
        <h1>Monty</h1>
        <p>{error || 'Opening your study space…'}</p>
        {error && (
          <button className="secondary" onClick={() => location.reload()}>
            Retry
          </button>
        )}
      </div>
    );
  const w = state.monty,
    folder = folderId ? w.folders[folderId] : undefined;
  const leaveFolder = () => {
    if (folder?.parentId) setFolderId(folder.parentId);
    else setFolderId(null);
  };
  const toastView = toast && (
    <div className="toast" role="alert">
      <span>{toast}</span>
      <button
        className="icon-button"
        aria-label="Dismiss notification"
        onClick={() => setToast('')}
      >
        <X size={17} />
      </button>
    </div>
  );

  const children = Object.values(w.folders)
    .filter((f) => f.area === area && f.parentId === null)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.createdAt - b.createdAt);
  async function deleteFolder(f: Folder) {
    if (!confirm(`Permanently delete “${f.name}”, its notes, PDFs, bookmarks, tests and results?`))
      return;
    const before = current(),
      ids = new Set([f.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const child of Object.values(before.monty!.folders))
        if (child.parentId && ids.has(child.parentId) && !ids.has(child.id)) {
          ids.add(child.id);
          changed = true;
        }
    }
    const files = Object.values(before.monty!.attachments).filter((a) => ids.has(a.folderId)),
      docs = before.documents.filter((d) => ids.has(d.folderId ?? '')),
      removedBanks: string[] = [];
    await commit((s) => {
      const folders = Object.fromEntries(
        Object.entries(s.monty!.folders).filter(([id]) => !ids.has(id)),
      );
      const attachments = Object.fromEntries(
        Object.entries(s.monty!.attachments).filter(([, a]) => !ids.has(a.folderId)),
      );
      const tests = Object.fromEntries(
        Object.entries(s.monty!.tests).filter(([, t]) => !ids.has(t.folderId)),
      );
      const scoped = (m: Record<string, string[]>) =>
        Object.fromEntries(Object.entries(m).filter(([id]) => !ids.has(id)));
      const bookmarks = scoped(s.monty!.bookmarks),
        mathPracticeBookmarks = scoped(s.monty!.mathPracticeBookmarks),
        mathTestBookmarks = scoped(s.monty!.mathTestBookmarks);
      const usedBanks = new Set([
        ...Object.values(attachments).flatMap((a) => (a.bankId ? [a.bankId] : [])),
        ...Object.values(tests).map((t) => t.bankId),
        ...[bookmarks, mathPracticeBookmarks, mathTestBookmarks].flatMap((m) =>
          Object.values(m)
            .flat()
            .map((r) => r.split('|')[0]),
        ),
      ]);
      const banks = Object.fromEntries(
        Object.entries(s.monty!.banks).filter(([id]) => {
          if (usedBanks.has(id)) return true;
          removedBanks.push(id);
          return false;
        }),
      );
      const documents = s.documents.filter((d) => !ids.has(d.folderId ?? '')),
        legacyTests = s.tests.filter((t) => !ids.has(t.folderId ?? ''));
      const usedEntries = new Set([
        ...documents.flatMap((d) => d.entryIds),
        ...legacyTests.flatMap((t) => t.questions.map((q) => q.entry.id)),
        ...Object.values(bookmarks).flat(),
      ]);
      const entries = Object.fromEntries(
        Object.entries(s.entries).filter(([id]) => usedEntries.has(id)),
      );
      return {
        ...s,
        documents,
        tests: legacyTests,
        entries,
        bookmarks: bookmarks['english-vocab-anto-syno'] ?? [],
        monty: {
          ...s.monty!,
          folders,
          attachments,
          tests,
          banks,
          bookmarks,
          mathPracticeBookmarks,
          mathTestBookmarks,
        },
      };
    });
    for (const file of files) await removeAttachment(file.id);
    for (const id of removedBanks) await removeAttachment(id);
    for (const doc of docs) await removePdf(doc.id);
  }
  const folderCards = (
    <div className="folder-grid">
      {children.map((f) => (
        <article className="folder-card" key={f.id}>
          <button className="folder-open" onClick={() => setFolderId(f.id)}>
            <FolderIcon size={27} />
            <span>
              <strong>{f.name}</strong>
              <small>
                {Object.values(w.attachments).filter((a) => a.folderId === f.id).length +
                  state.documents.filter((d) => d.folderId === f.id).length}{' '}
                files{f.pinned ? ' · Pinned' : ''}
              </small>
            </span>
            <ChevronRight size={18} />
          </button>
          <div className="actions">
            <button
              className="icon-button"
              aria-label={`Rename folder ${f.name}`}
              onClick={() => {
                const name = prompt('Rename folder', f.name)?.trim();
                if (name)
                  void act(() =>
                    commit((s) => ({
                      ...s,
                      monty: {
                        ...s.monty!,
                        folders: {
                          ...s.monty!.folders,
                          [f.id]: { ...s.monty!.folders[f.id], name },
                        },
                      },
                    })),
                  );
              }}
            >
              <Pencil size={15} />
            </button>
            <button
              className="icon-button"
              aria-label={`${f.pinned ? 'Unpin' : 'Pin'} folder ${f.name}`}
              onClick={() =>
                void act(() =>
                  commit((s) => ({
                    ...s,
                    monty: {
                      ...s.monty!,
                      folders: {
                        ...s.monty!.folders,
                        [f.id]: { ...s.monty!.folders[f.id], pinned: !f.pinned },
                      },
                    },
                  })),
                )
              }
            >
              <Pin size={15} fill={f.pinned ? 'currentColor' : 'none'} />
            </button>
            <button
              className="icon-button delete"
              aria-label={`Delete folder ${f.name}`}
              onClick={() => void act(() => deleteFolder(f))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
  const creationView = creating && !folder && (
    <div className="modal-backdrop">
      <form
        className="editor-modal compact-modal"
        onSubmit={(e) => {
          e.preventDefault();
          const name = folderName.trim();
          if (!name || folder || !area) return;
          const id = uid();
          void act(async () => {
            await commit((s) => ({
              ...s,
              monty: {
                ...s.monty!,
                folders: {
                  ...s.monty!.folders,
                  [id]: {
                    id,
                    name,
                    area: area!,
                    parentId: null,
                    pinned: false,
                    profile,
                    createdAt: Date.now(),
                  },
                },
              },
            }));
            setCreating(false);
          });
        }}
      >
        <h2>New folder</h2>
        <label className="field">
          Folder name
          <input
            autoFocus
            required
            maxLength={100}
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
          />
        </label>
        {area === 'vocab' && (
          <label className="field">
            Content
            <select
              value={profile}
              onChange={(e) => setProfile(e.target.value as Folder['profile'])}
            >
              <option value="auto">Auto-detect / general importer</option>
              <option value="vocab">Synonyms & antonyms</option>
              <option value="idioms">Idioms</option>
            </select>
          </label>
        )}
        <div className="actions">
          <button type="button" className="secondary" onClick={() => setCreating(false)}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Create folder
          </button>
        </div>
      </form>
    </div>
  );
  const breadcrumbs = area && (
    <div className="breadcrumbs">
      <button
        onClick={() => {
          setSubject(null);
          setArea(null);
          setFolderId(null);
        }}
      >
        Home
      </button>
      <span>/</span>
      <button
        onClick={() => {
          setFolderId(null);
          if (subject === 'english') setArea(null);
        }}
      >
        {subject === 'english' ? 'English' : 'Maths'}
      </button>
      {subject === 'english' && (
        <>
          <span>/</span>
          <button onClick={() => setFolderId(null)}>{labels[area]}</button>
        </>
      )}
      {folder && (
        <>
          <span>/</span>
          <strong>{folder.name}</strong>
        </>
      )}
    </div>
  );
  if (folder?.profile === 'vocab' && !settings)
    return (
      <>
        <VocabApp
          key={folder.id}
          store={scopedStore(store, folder.id)}
          folderName={folder.name}
          onBack={leaveFolder}
          onSettings={() => setSettings(true)}
          renderNotes={() => (
            <NotesPanel folderId={folder.id} state={state} commit={commit} notify={notify} />
          )}
          renderBreadcrumbs={() => breadcrumbs}
          onHome={() => {
            setSubject(null);
            setArea(null);
            setFolderId(null);
          }}
        />
        {toastView}
        {creationView}
      </>
    );
  return (
    <div className="app-shell monty-shell">
      <header className="app-header">
        <button
          className="brand brand-button"
          onClick={() => {
            setSubject(null);
            setArea(null);
            setFolderId(null);
            setSettings(false);
          }}
          aria-label="Monty home"
        >
          <span className="brand-mark">
            <NotebookPen size={26} />
          </span>
          <span>Monty</span>
        </button>
        <CloudStatus />
        <button
          className="icon-button"
          aria-label="Settings"
          onClick={() => setSettings((s) => !s)}
        >
          <SettingsIcon size={21} />
        </button>
      </header>
      <main>
        {error && (
          <div className="notice danger" role="alert">
            {error}
          </div>
        )}
        {settings ? (
          <Settings
            state={state}
            onUpdate={commit}
            onBack={() => setSettings(false)}
            notify={notify}
          />
        ) : !subject ? (
          <>
            <div className="home-heading">
              <span className="eyebrow">Your study space</span>
              <h1>What shall we study?</h1>
            </div>
            <div className="subject-grid">
              <button
                className="subject-card english"
                onClick={() => {
                  setSubject('english');
                  setArea(null);
                }}
              >
                <BookOpen size={32} />
                <span>
                  <strong>English</strong>
                  <small>Grammar, vocabulary & reading</small>
                </span>
                <ChevronRight />
              </button>
              <button
                className="subject-card maths"
                onClick={() => {
                  setSubject('maths');
                  setArea('maths');
                }}
              >
                <Calculator size={32} />
                <span>
                  <strong>Maths</strong>
                  <small>Notes, practice & timed tests</small>
                </span>
                <ChevronRight />
              </button>
            </div>
          </>
        ) : !area ? (
          <>
            <button className="back-button" onClick={() => setSubject(null)}>
              <ArrowLeft size={17} /> Home
            </button>
            <h1>English</h1>
            <div className="subject-grid">
              {(['grammar', 'vocab', 'reading'] as Area[]).map((a) => (
                <button className="category-card" key={a} onClick={() => setArea(a)}>
                  <BookOpen size={23} />
                  <strong>{labels[a]}</strong>
                  <ChevronRight size={19} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {breadcrumbs}
            {!folder && (
              <div className="page-heading">
                <h1>{labels[area]}</h1>
                <button
                  className="primary"
                  onClick={() => {
                    setFolderName('');
                    setProfile(area === 'maths' ? 'maths' : 'auto');
                    setCreating(true);
                  }}
                >
                  <Plus size={17} /> New folder
                </button>
              </div>
            )}
            {!folder && folderCards}
            {!folder && !children.length && (
              <div className="empty-state">
                <FolderIcon size={32} />
                <h2>Create your first folder</h2>
                <p>Keep each topic’s notes, practice and tests together.</p>
              </div>
            )}
            {folder && (
              <StudyFolder
                key={folder.id}
                folder={folder}
                state={state}
                current={current}
                commit={commit}
                notify={notify}
                onBack={leaveFolder}
              />
            )}
          </>
        )}
      </main>
      {toastView}
      {creationView}
    </div>
  );
}
