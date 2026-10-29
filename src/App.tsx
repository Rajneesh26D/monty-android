import { useEffect, useRef, useState, type ReactNode } from 'react';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  BookOpen,
  Library,
  ClipboardList,
  BarChart3,
  Settings as SettingsIcon,
  Plus,
  FileText,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Search,
  Shuffle,
  Bookmark,
  RefreshCw,
  Check,
  Pause,
  MoreHorizontal,
  X,
  Download,
  NotebookPen,
  StickyNote,
} from 'lucide-react';
import { type Entry, type State, type QuizTest, type Kind } from '../shared/types';
import { useStore } from './storage/useStore';
import { removePdf } from './storage/repository';
import { exportBackup, importBackup } from './storage/backup';
import { addDocument, processDocument, repairSourceDocuments } from './services/importer';
import { canQuiz, needsEnrichment } from './core/vocabulary';
import {
  createTest,
  startAttempt,
  finishAttempt,
  shuffle,
  quizPool,
  splitSizes,
  splitTest,
} from './core/quiz';
import { WordCard, BookmarkButton } from './components/WordCard';
import { Choices } from './components/Question';
import { Analysis } from './components/Analysis';
import { EntryEditor } from './components/EntryEditor';
import { Settings } from './components/Settings';
import { useAttemptClock } from './components/useAttemptClock';
import { time } from './core/exams';
import type { AttemptClock } from '../shared/monty';
import { CloudStatus } from './components/CloudStatus';
import { PdfCard } from './components/PdfCard';
import { openPdfInApp } from './services/openPdf';
import { VocabularyExam } from './components/VocabularyExam';
type Tab = 'library' | 'learn' | 'quiz' | 'results' | 'settings' | 'bookmarks' | 'notes';
const date = (time: number) =>
  new Date(time).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
export default function App({
  store,
  onBack,
  folderName,
  renderNotes,
  renderBreadcrumbs,
  onHome,
  onSettings,
}: {
  store: ReturnType<typeof useStore>;
  onBack: () => void;
  folderName: string;
  renderNotes: () => ReactNode;
  renderBreadcrumbs: () => ReactNode;
  onHome: () => void;
  onSettings: () => void;
}) {
  const { state, commit, error, current } = store;
  const [tab, setTab] = useState<Tab>('library'),
    [toast, setToast] = useState(''),
    [progress, setProgress] = useState<{ message: string; percent: number } | null>(null);
  const [query, setQuery] = useState(''),
    [scope, setScope] = useState('all'),
    [savedOnly, setSavedOnly] = useState(false),
    [learnOrder, setLearnOrder] = useState<string[] | null>(null),
    [learnLimit, setLearnLimit] = useState(30);
  const [selected, setSelected] = useState<string[]>([]),
    [bookmarkSource, setBookmarkSource] = useState(false),
    [count, setCount] = useState(10),
    [useCustom, setUseCustom] = useState(false),
    [customCount, setCustomCount] = useState(''),
    [splits, setSplits] = useState(1);
  const [activeId, setActiveId] = useState<string | null>(null),
    [analysisId, setAnalysisId] = useState<string | null>(null),
    [resultId, setResultId] = useState<string | null>(null),
    [editing, setEditing] = useState<Entry | null>(null);
  const upload = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null),
    main = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
  }, [tab, activeId, analysisId, resultId]);
  useEffect(() => {
    setLearnLimit(30);
  }, [query, scope, savedOnly, tab]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const h = NativeApp.addListener('backButton', () => {
      if (editing) setEditing(null);
      else if (activeId) {
        setActiveId(null);
        setTab('quiz');
      } else if (analysisId) {
        setAnalysisId(null);
        setTab('results');
      } else if (resultId) setResultId(null);
      else if (tab !== 'library') setTab('library');
      else void NativeApp.minimizeApp();
    });
    return () => {
      void h.then((x) => x.remove());
    };
  }, [tab, activeId, analysisId, resultId, editing]);
  const repairing = useRef(false);
  useEffect(() => {
    if (!state || repairing.current) return;
    repairing.current = true;
    void repairSourceDocuments(current, commit);
  }, [!!state]);
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Something went wrong. Please retry.');
    }
  };
  const bookmark = (entry: Entry) => {
    void act(() =>
      commit((s) => ({
        ...s,
        entries: { ...s.entries, [entry.id]: s.entries[entry.id] || entry },
        bookmarks: s.bookmarks.includes(entry.id)
          ? s.bookmarks.filter((id) => id !== entry.id)
          : [...s.bookmarks, entry.id],
      })),
    );
  };
  async function importFiles(files: File[]) {
    if (controller.current) return;
    controller.current = new AbortController();
    for (const file of files) {
      if (controller.current.signal.aborted) break;
      await act(() =>
        addDocument(
          file,
          current,
          commit,
          (message, percent) => setProgress({ message, percent }),
          controller.current!.signal,
        ),
      );
    }
    controller.current = null;
    setProgress(null);
  }
  async function retry(id: string) {
    if (controller.current) return;
    controller.current = new AbortController();
    await act(() =>
      processDocument(
        id,
        current,
        commit,
        (message, percent) => setProgress({ message, percent }),
        controller.current!.signal,
      ),
    );
    controller.current = null;
    setProgress(null);
  }
  async function deleteDoc(id: string) {
    const doc = current().documents.find((d) => d.id === id);
    if (
      !doc ||
      !confirm(`Remove “${doc.name}” and its words? Saved tests and their results will remain.`)
    )
      return;
    await commit((s) => {
      const entries = { ...s.entries };
      for (const e of Object.values(entries)) {
        const sources = e.sources.filter((r) => r.documentId !== id);
        if (!sources.length && e.sources.some((r) => r.documentId === id)) delete entries[e.id];
        else entries[e.id] = { ...e, sources };
      }
      return {
        ...s,
        documents: s.documents.filter((d) => d.id !== id),
        entries,
        bookmarks: s.bookmarks.filter((id) => !!entries[id]),
      };
    });
    await removePdf(id);
    setSelected((ids) => ids.filter((x) => x !== id));
  }
  async function begin(test: QuizTest) {
    const started = startAttempt(test);
    await commit((s) => ({ ...s, tests: s.tests.map((t) => (t.id === test.id ? started : t)) }));
    setActiveId(test.id);
    setAnalysisId(null);
    setResultId(null);
    setTab('quiz');
  }
  async function generate() {
    const s = current(),
      docs = s.documents.filter((d) => selected.includes(d.id));
    const ids = bookmarkSource ? s.bookmarks : [...new Set(docs.flatMap((d) => d.entryIds))];
    const entries = ids.map((id) => s.entries[id]).filter(Boolean);
    if (!bookmarkSource && !docs.length) throw new Error('Select at least one PDF.');
    const source = bookmarkSource ? 'bookmarks' : docs.length > 1 ? 'combined' : 'pdf';
    const name = bookmarkSource
      ? `Bookmarks · ${entries.filter(canQuiz).length} words`
      : docs.length > 1
        ? `Combined · ${docs.length} PDFs`
        : docs[0].name;
    const test = createTest(
      entries,
      name,
      source,
      docs.map((d) => d.name),
      useCustom ? Number(customCount) : count,
    );
    if (
      useCustom &&
      (!customCount ||
        !Number.isInteger(Number(customCount)) ||
        Number(customCount) < 1 ||
        Number(customCount) > quizPool(entries).length)
    )
      throw new Error(`Choose between 1 and ${quizPool(entries).length} questions.`);
    const parts = !bookmarkSource && docs.length > 1 ? splits : 1;
    const generated = (parts > 1 ? splitTest(test, parts) : [test]).map(startAttempt);
    await commit((s) => ({ ...s, tests: [...generated, ...s.tests] }));
    setActiveId(generated[0].id);
    setResultId(null);
    setAnalysisId(null);
  }
  async function deleteTest(test: QuizTest) {
    if (
      !confirm(
        `Permanently delete “${test.name}”, its unfinished attempt and any saved result? This cannot be undone.`,
      )
    )
      return;
    await commit((s) => ({ ...s, tests: s.tests.filter((t) => t.id !== test.id) }));
  }
  function navigate(next: Tab) {
    setTab(next);
    setAnalysisId(null);
    setResultId(null);
    setActiveId(null);
  }
  const timed = state?.tests.find((t) => t.id === activeId),
    timedDraft = timed?.draft;
  const persistClock = async (clock: AttemptClock) =>
    commit((s) => ({
      ...s,
      tests: s.tests.map((t) =>
        !!t.draft && !!timedDraft && t.id === activeId && t.draft.id === timedDraft.id
          ? { ...t, draft: { ...t.draft!, clock } }
          : t,
      ),
    }));
  const timer = useAttemptClock(
    timedDraft ? (timedDraft.id ?? timed!.id) : undefined,
    timedDraft ? timed?.questions[timedDraft.index]?.id : undefined,
    timedDraft?.clock,
    persistClock,
    async (clock) => {
      await commit((s) => ({
        ...s,
        tests: s.tests.map((t) =>
          !!t.draft && !!timedDraft && t.id === activeId && t.draft.id === timedDraft.id
            ? finishAttempt({ ...t, draft: { ...t.draft!, clock } }, true)
            : t,
        ),
      }));
      setResultId(activeId);
      setActiveId(null);
      setTab('results');
    },
  );
  if (!state)
    return (
      <div className="loading">
        <div className="brand-mark">V</div>
        <h1>Monty</h1>
        <p>{error || 'Opening your library…'}</p>
        {error && (
          <>
            <button className="secondary" onClick={() => location.reload()}>
              Retry
            </button>
            <label className="secondary">
              Restore backup
              <input
                hidden
                type="file"
                accept=".zip,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void importBackup(file)
                      .then(() => location.reload())
                      .catch((e) => setToast(e.message));
                }}
              />
            </label>
            {toast && <p role="alert">{toast}</p>}
          </>
        )}
      </div>
    );
  const entries = Object.values(state.entries),
    active = state.tests.find((t) => t.id === activeId),
    review = state.tests.find((t) => t.id === analysisId),
    result = state.tests.find((t) => t.id === resultId);
  const fullQuiz = !!active?.draft;
  const selectedDocs = state.documents.filter((d) => selected.includes(d.id));
  const available = quizPool(
    (bookmarkSource ? state.bookmarks : [...new Set(selectedDocs.flatMap((d) => d.entryIds))])
      .map((id) => state.entries[id])
      .filter(Boolean),
  );
  const requested = useCustom ? Number(customCount) : count;
  const total = Math.min(requested || available.length, available.length);
  const splitCount = !bookmarkSource && selectedDocs.length > 1 ? splits : 1;
  const validCount =
    !useCustom ||
    (!!customCount &&
      Number.isInteger(requested) &&
      requested >= 1 &&
      requested <= available.length);
  const sizes = total >= splitCount ? splitSizes(total, splitCount) : [];
  const notify = (message: string) => setToast(message);
  const testCard = (test: QuizTest) => (
    <article className="test-card" key={test.id}>
      <div className="card-heading">
        <div className="test-type">
          <span className="file-icon">
            {test.source === 'bookmarks' ? (
              <Bookmark size={18} />
            ) : test.source === 'combined' ? (
              <Library size={18} />
            ) : (
              <ClipboardList size={18} />
            )}
          </span>
          <div>
            <h3>{test.name}</h3>
            <p className="muted">
              {test.questions.length} words · {date(test.createdAt)}
            </p>
          </div>
        </div>
        <div className="actions">
          <button
            className="icon-button delete"
            aria-label={`Delete test ${test.name}`}
            onClick={() => void act(() => deleteTest(test))}
          >
            <Trash2 size={17} />
          </button>
          {test.latest && (
            <span className="small-score">
              {test.latest.score}
              <small>/{test.latest.total}</small>
            </span>
          )}
        </div>
      </div>
      {test.draft && (
        <button
          className="primary full"
          onClick={() => {
            setActiveId(test.id);
            setTab('quiz');
            setAnalysisId(null);
            setResultId(null);
          }}
        >
          Resume {test.latest ? 'reattempt' : 'test'} <ArrowRight size={16} />
        </button>
      )}
      {test.latest ? (
        <div className="test-actions">
          <button
            className="secondary"
            onClick={() => {
              setResultId(test.id);
              setAnalysisId(null);
              setTab('results');
            }}
          >
            Result
          </button>
          <button
            className="secondary"
            onClick={() => {
              setAnalysisId(test.id);
              setTab('results');
            }}
          >
            Analyse
          </button>
          <button
            className="text-button"
            onClick={() => {
              if (
                !test.draft ||
                confirm('Start a fresh reattempt? Your unfinished selections will be replaced.')
              )
                void act(() => begin(test));
            }}
          >
            <RefreshCw size={15} /> Reattempt
          </button>
        </div>
      ) : (
        !test.draft && (
          <button className="secondary full" onClick={() => void act(() => begin(test))}>
            Start test
          </button>
        )
      )}
    </article>
  );
  return (
    <div className="app-shell monty-shell">
      <header className="app-header">
        <button
          className="brand brand-button"
          aria-label="Monty home"
          onClick={() => void timer.pause().then(onHome)}
        >
          <span className="brand-mark">
            <NotebookPen size={26} />
          </span>
          <span>Monty</span>
        </button>
        <CloudStatus />
        {!fullQuiz && (
          <button className="icon-button" aria-label="Settings" onClick={onSettings}>
            <SettingsIcon size={21} />
          </button>
        )}
      </header>
      <main ref={main}>
        {!fullQuiz && (
          <>
            {renderBreadcrumbs()}
            <div className="folder-toolbar">
              <button className="back-button" onClick={() => void timer.pause().then(onBack)}>
                <ArrowLeft size={17} /> Folders
              </button>
              <span className="eyebrow">{folderName}</span>
            </div>
          </>
        )}
        <div className="folder-content">
          {error && (
            <div className="notice danger" role="alert">
              {error}
              <button className="text-button" onClick={() => void act(() => exportBackup(state))}>
                <Download size={16} /> Export backup
              </button>
            </div>
          )}
          {progress && (
            <div className="import-progress" role="status">
              <div className="card-heading">
                <strong>{progress.message}</strong>
                <button className="text-button" onClick={() => controller.current?.abort()}>
                  <Pause size={16} /> Pause
                </button>
              </div>
              <progress max={100} value={progress.percent} />
            </div>
          )}
          {fullQuiz ? (
            <VocabularyExam
              test={active}
              timer={timer}
              saved={state.bookmarks.includes(active.questions[active.draft!.index].entry.id)}
              onBookmark={() => bookmark(active.questions[active.draft!.index].entry)}
              onUpdate={(change) =>
                act(() =>
                  commit((s) => ({
                    ...s,
                    tests: s.tests.map((t) => (t.id === active.id ? change(t) : t)),
                  })),
                )
              }
              onExit={() => {
                setActiveId(null);
                setTab('quiz');
              }}
              onSubmit={() =>
                void act(async () => {
                  await commit((s) => ({
                    ...s,
                    tests: s.tests.map((t) =>
                      t.id === active.id && t.draft?.id === active.draft?.id
                        ? finishAttempt(
                            { ...t, draft: { ...t.draft!, clock: timer.capture() } },
                            true,
                          )
                        : t,
                    ),
                  }));
                  setActiveId(null);
                  setResultId(active.id);
                  setTab('results');
                })
              }
            />
          ) : review?.latest ? (
            <Analysis
              key={review.id}
              test={review}
              state={state}
              onBack={() => {
                setAnalysisId(null);
                setResultId(review.id);
              }}
              onHide={(hide) =>
                void act(() =>
                  commit((s) => ({ ...s, settings: { ...s.settings, hideReviewAnswers: hide } })),
                )
              }
              onBookmark={bookmark}
            />
          ) : result?.latest ? (
            <div>
              <button className="back-button" onClick={() => setResultId(null)}>
                <ArrowLeft size={18} /> All results
              </button>
              <div className="result-summary">
                <span className="eyebrow">Test completed</span>
                <h1>{result.name}</h1>
                <div className="score">
                  {result.latest.score}
                  <span>/{result.latest.total}</span>
                </div>
                <p>
                  {Math.round((result.latest.score / result.latest.total) * 100)}% ·{' '}
                  {result.latest.score} correct ·{' '}
                  {result.latest.wrong ?? result.latest.total - result.latest.score} wrong ·{' '}
                  {result.latest.unanswered ?? 0} unanswered
                </p>
                <p className="muted">{date(result.latest.completedAt)}</p>
                <p>
                  Time taken:{' '}
                  {result.latest.elapsedMs === undefined
                    ? 'Not recorded'
                    : time(result.latest.elapsedMs)}
                </p>
              </div>
              <button
                className="primary full"
                onClick={() => {
                  setAnalysisId(result.id);
                  setResultId(null);
                }}
              >
                Analyse answers <ArrowRight size={17} />
              </button>
              <button className="secondary full" onClick={() => void act(() => begin(result))}>
                <RefreshCw size={17} /> Reattempt test
              </button>
            </div>
          ) : tab === 'notes' ? (
            renderNotes()
          ) : tab === 'settings' ? (
            <Settings
              state={state}
              onUpdate={commit}
              onBack={() => navigate('library')}
              notify={notify}
            />
          ) : tab === 'library' ? (
            <>
              <div className="page-heading">
                <div>
                  <h1>Practice</h1>
                  <p className="muted">
                    {state.documents.length} PDFs <span className="dot">·</span> {entries.length}{' '}
                    words
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={!!progress}
                  onClick={() => upload.current?.click()}
                >
                  <Plus size={19} /> Add PDF
                </button>
              </div>
              <input
                ref={upload}
                type="file"
                hidden
                accept="application/pdf,.pdf"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = '';
                  void importFiles(files);
                }}
              />
              {!state.documents.length ? (
                <div className="empty-state">
                  <span className="empty-icon">
                    <FileText size={30} />
                  </span>
                  <h2>Your first word list</h2>
                  <p>Add a vocabulary PDF to get started.</p>
                  <button
                    className="primary"
                    disabled={!!progress}
                    onClick={() => upload.current?.click()}
                  >
                    <Plus size={17} /> Add PDF
                  </button>
                </div>
              ) : (
                <div className="document-list">
                  {[...state.documents]
                    .sort(
                      (a, b) =>
                        Number(!!b.pinned) - Number(!!a.pinned) || a.createdAt - b.createdAt,
                    )
                    .map((doc) => {
                      const incomplete = doc.entryIds.filter(
                        (id) => state.entries[id] && needsEnrichment(state.entries[id]),
                      ).length;
                      return (
                        <PdfCard
                          key={doc.id}
                          name={doc.name}
                          pinned={doc.pinned}
                          summary={
                            <>
                              {doc.entryIds.length} words · {date(doc.createdAt)}
                            </>
                          }
                          disabled={!!progress}
                          onRename={() => {
                            const name = prompt('Rename PDF', doc.name)?.trim();
                            if (name)
                              void act(() =>
                                commit((s) => ({
                                  ...s,
                                  documents: s.documents.map((d) =>
                                    d.id === doc.id ? { ...d, name } : d,
                                  ),
                                })),
                              );
                          }}
                          onPin={() =>
                            void act(() =>
                              commit((s) => ({
                                ...s,
                                documents: s.documents.map((d) =>
                                  d.id === doc.id ? { ...d, pinned: !d.pinned } : d,
                                ),
                              })),
                            )
                          }
                          onDelete={() => void act(() => deleteDoc(doc.id))}
                        >
                          {doc.status === 'pending' && (
                            <div className="document-note">
                              <span className="status">
                                {incomplete || doc.pendingPages.length
                                  ? 'Needs completion'
                                  : 'Import paused'}
                              </span>
                              {doc.error && <p>{doc.error}</p>}
                              <button
                                className="text-button"
                                disabled={!!progress}
                                onClick={() => void retry(doc.id)}
                              >
                                <RefreshCw size={14} /> Retry missing information
                              </button>
                            </div>
                          )}
                          <div className="document-actions">
                            <button
                              className="primary"
                              disabled={!doc.entryIds.length}
                              onClick={() => {
                                setScope(doc.id);
                                setSavedOnly(false);
                                navigate('learn');
                              }}
                            >
                              Practice
                            </button>
                            <button
                              className="secondary"
                              onClick={() => void openPdfInApp({ ...doc, legacy: true }, notify)}
                            >
                              Open PDF
                            </button>
                            <button
                              className="text-button"
                              disabled={!doc.entryIds.length}
                              onClick={() => {
                                setScope(doc.id);
                                setSavedOnly(false);
                                navigate('learn');
                              }}
                            >
                              Review / edit
                            </button>
                          </div>
                        </PdfCard>
                      );
                    })}
                </div>
              )}
            </>
          ) : tab === 'learn' || tab === 'bookmarks' ? (
            (() => {
              const scoped =
                tab === 'bookmarks' || scope === 'all'
                  ? entries
                  : entries.filter((e) =>
                      state.documents.find((d) => d.id === scope)?.entryIds.includes(e.id),
                    );
              let words = scoped.filter(
                (e) =>
                  (!(savedOnly || tab === 'bookmarks') || state.bookmarks.includes(e.id)) &&
                  `${e.word} ${e.meaningEn} ${e.meaningHi}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              );
              if (learnOrder)
                words.sort((a, b) => learnOrder.indexOf(a.id) - learnOrder.indexOf(b.id));
              return (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>{tab === 'bookmarks' ? 'Bookmarks' : 'Practice'}</h1>
                    </div>
                    <span className="count-badge">{words.length} words</span>
                  </div>
                  <div className="learn-controls">
                    <div className="search-input">
                      <Search size={18} />
                      <input
                        aria-label="Search vocabulary"
                        placeholder="Search word or meaning"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    {tab !== 'bookmarks' && (
                      <>
                        <select
                          aria-label="Learning PDF"
                          value={scope}
                          onChange={(e) => setScope(e.target.value)}
                        >
                          <option value="all">All PDFs</option>
                          {state.documents.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                        <div className="filter-row">
                          <div className="segmented">
                            <button
                              className={!savedOnly ? 'selected' : ''}
                              onClick={() => setSavedOnly(false)}
                            >
                              All words
                            </button>
                            <button
                              className={savedOnly ? 'selected' : ''}
                              onClick={() => setSavedOnly(true)}
                            >
                              <Bookmark size={14} /> Bookmarked
                            </button>
                          </div>
                          <button
                            className="icon-button"
                            aria-label="Shuffle words"
                            onClick={() => setLearnOrder(shuffle(entries.map((e) => e.id)))}
                          >
                            <Shuffle size={19} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  {words.length ? (
                    <>
                      <div className="word-grid">
                        {words.slice(0, learnLimit).map((entry) => (
                          <WordCard
                            key={entry.id}
                            entry={entry}
                            saved={state.bookmarks.includes(entry.id)}
                            onBookmark={() => bookmark(entry)}
                            onEdit={() => setEditing(entry)}
                          />
                        ))}
                      </div>
                      {words.length > learnLimit && (
                        <button
                          className="secondary full"
                          onClick={() => setLearnLimit((n) => n + 30)}
                        >
                          Show more words
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="empty-state">
                      <BookOpen size={30} />
                      <h2>
                        {savedOnly || tab === 'bookmarks' ? 'No bookmarks yet' : 'No words found'}
                      </h2>
                      <p>
                        {savedOnly || tab === 'bookmarks'
                          ? 'Tap the bookmark beside any word.'
                          : 'Add a PDF or change your search.'}
                      </p>
                    </div>
                  )}
                </>
              );
            })()
          ) : tab === 'quiz' ? (
            <>
              <div className="page-heading">
                <div>
                  <h1>Quiz</h1>
                </div>
              </div>
              {state.tests.some((t) => t.draft) && (
                <section>
                  <h2 className="section-title">Continue</h2>
                  {state.tests.filter((t) => t.draft).map(testCard)}
                </section>
              )}
              <section className="panel quiz-setup">
                <h2>New test</h2>
                <div className="segmented full">
                  <button
                    className={!bookmarkSource ? 'selected' : ''}
                    onClick={() => setBookmarkSource(false)}
                  >
                    From PDFs
                  </button>
                  <button
                    className={bookmarkSource ? 'selected' : ''}
                    onClick={() => setBookmarkSource(true)}
                  >
                    <Bookmark size={15} /> Bookmarks
                  </button>
                </div>
                {bookmarkSource ? (
                  <div className="bookmark-selection">
                    <p className="selection-summary">{available.length} bookmarked words ready</p>
                    <div className="bookmark-preview">
                      {state.bookmarks
                        .map((id) => state.entries[id])
                        .filter(Boolean)
                        .map((e) => (
                          <span key={e.id}>
                            {e.word}
                            {!canQuiz(e) && <small> · needs completion</small>}
                          </span>
                        ))}
                    </div>
                    <button className="text-button" onClick={() => navigate('bookmarks')}>
                      View bookmark details <ArrowRight size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="pdf-checklist">
                    {state.documents.length ? (
                      <>
                        <div className="checklist-top">
                          <span>Select PDFs to combine</span>
                          <button
                            className="text-button"
                            onClick={() =>
                              setSelected(
                                selected.length === state.documents.length
                                  ? []
                                  : state.documents.map((d) => d.id),
                              )
                            }
                          >
                            {selected.length === state.documents.length ? 'Clear' : 'Select all'}
                          </button>
                        </div>
                        {state.documents.map((d) => (
                          <label className="pdf-check" key={d.id}>
                            <input
                              type="checkbox"
                              checked={selected.includes(d.id)}
                              onChange={(e) =>
                                setSelected((s) =>
                                  e.target.checked ? [...s, d.id] : s.filter((id) => id !== d.id),
                                )
                              }
                            />
                            <span>
                              {d.name}
                              <small>
                                {
                                  d.entryIds.filter(
                                    (id) => state.entries[id] && canQuiz(state.entries[id]),
                                  ).length
                                }{' '}
                                words ready
                              </small>
                            </span>
                          </label>
                        ))}
                      </>
                    ) : (
                      <p className="muted">Add a PDF to create a test.</p>
                    )}
                  </div>
                )}
                <label className="field-label">Number of words</label>
                <div className="segmented counts">
                  {[10, 20, 0].map((n) => (
                    <button
                      key={n}
                      className={!useCustom && count === n ? 'selected' : ''}
                      onClick={() => {
                        setUseCustom(false);
                        setCount(n);
                      }}
                    >
                      {n || 'All'}
                    </button>
                  ))}
                  <button
                    className={useCustom ? 'selected' : ''}
                    onClick={() => setUseCustom(true)}
                  >
                    Custom
                  </button>
                </div>
                {useCustom && (
                  <label className="field">
                    Custom questions
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max={available.length}
                      step="1"
                      placeholder={`1–${available.length}`}
                      value={customCount}
                      onChange={(e) => setCustomCount(e.target.value)}
                    />
                  </label>
                )}
                <p className="muted selection-total">
                  {available.length} unique words available · {validCount ? total : 0} selected
                </p>
                {!bookmarkSource && selectedDocs.length > 1 && (
                  <label className="field">
                    Split into separate tests
                    <select
                      aria-label="Split tests"
                      value={splits}
                      onChange={(e) => setSplits(Number(e.target.value))}
                    >
                      <option value={1}>One combined test</option>
                      {[2, 3, 4, 5].map((n) => (
                        <option key={n} value={n} disabled={total < n}>
                          {n} tests
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {splitCount > 1 && sizes.length > 0 && (
                  <p className="split-preview">
                    {sizes.join(' + ')} questions · {splitCount} separate results
                  </p>
                )}
                <button
                  className="primary full"
                  disabled={!available.length || !validCount || total < splitCount}
                  onClick={() => void act(generate)}
                >
                  {splitCount > 1 ? `Create ${splitCount} tests & start` : 'Generate & start'}{' '}
                  <ArrowRight size={17} />
                </button>
              </section>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <h1>Results</h1>
                  <p className="muted">
                    {state.tests.filter((t) => t.latest).length} completed tests
                  </p>
                </div>
              </div>
              {state.tests.some((t) => t.latest) ? (
                state.tests.filter((t) => t.latest).map(testCard)
              ) : (
                <div className="empty-state">
                  <BarChart3 size={32} />
                  <h2>No results yet</h2>
                  <p>Complete a test to see your results here.</p>
                  <button className="primary" onClick={() => navigate('quiz')}>
                    Create a test <ArrowRight size={17} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        {!fullQuiz && (
          <nav className="folder-nav" aria-label="Folder navigation">
            {(
              [
                ['notes', 'Notes', StickyNote],
                ['library', 'Practice', BookOpen],
                ['quiz', 'Quiz', ClipboardList],
                ['bookmarks', 'Bookmarks', Bookmark],
                ['results', 'Results', BarChart3],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                aria-current={
                  tab === key || (key === 'library' && tab === 'learn') ? 'page' : undefined
                }
                onClick={() => navigate(key)}
                className={tab === key || (key === 'library' && tab === 'learn') ? 'active' : ''}
              >
                <Icon size={21} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        )}
      </main>
      {toast && (
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
      )}
      {editing && (
        <EntryEditor
          entry={editing}
          onClose={() => setEditing(null)}
          onSave={(entry) =>
            void act(async () => {
              await commit((s) => ({ ...s, entries: { ...s.entries, [entry.id]: entry } }));
              setEditing(null);
            })
          }
        />
      )}
    </div>
  );
}
