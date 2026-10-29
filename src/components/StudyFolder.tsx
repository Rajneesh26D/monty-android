import { PdfCard } from './PdfCard';
import { StudyContent } from './StudyContent';
import { useEffect, useRef, useState } from 'react';
import {
  Plus,
  FileText,
  Bookmark,
  Pause,
  Trash2,
  Pin,
  Pencil,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  BookOpen,
  ClipboardList,
  StickyNote,
  BarChart3,
} from 'lucide-react';
import type { State } from '../../shared/types';
import { uid } from '../../shared/types';
import type { Folder, Attachment, Bank, Exam, MCQ, StudyItem } from '../../shared/monty';
import type { Commit } from '../services/importer';
import { addPractice, importPractice, readBank, saveBank } from '../services/workspace';
import { removeAttachment } from '../storage/repository';
import { startExam, mathsTests, time } from '../core/exams';
import { shuffle, splitSizes } from '../core/quiz';
import { NotesPanel } from './NotesPanel';
import { openPdfInApp } from '../services/openPdf';
import { MCQView } from './MCQView';
import { ExamScreen, ExamAnalysis } from './ExamScreen';
import { SavedQuestions, questionRef } from './SavedQuestions';
import { BankEditor } from './BankEditor';
import { QuestionTracker } from './QuestionTracker';
import { resumePractice } from '../core/questionProgress';
type Tab = 'notes' | 'practice' | 'quiz' | 'results' | 'bookmarks';
export function StudyFolder({
  folder,
  state,
  current,
  commit,
  notify,
  onBack,
}: {
  folder: Folder;
  state: State;
  current: () => State;
  commit: Commit;
  notify: (s: string) => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>('practice'),
    [bank, setBank] = useState<Bank | null>(null),
    [selectedPdf, setSelectedPdf] = useState<string | null>(null),
    [studyMode, setStudyMode] = useState(true),
    [progress, setProgress] = useState<{ message: string; percent: number } | null>(null),
    [review, setReview] = useState<Attachment | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null),
    [resultId, setResultId] = useState<string | null>(null),
    [analysis, setAnalysis] = useState(false),
    [analysisIndex, setAnalysisIndex] = useState(0),
    [mathSaved, setMathSaved] = useState(false),
    [selection, setSelection] = useState<string[]>([]),
    [bookmarkSource, setBookmarkSource] = useState(false),
    [count, setCount] = useState('10'),
    [custom, setCustom] = useState(false),
    [splits, setSplits] = useState(1),
    [limit, setLimit] = useState(30);
  const controller = useRef<AbortController | null>(null),
    upload = useRef<HTMLInputElement>(null);
  const w = state.monty!,
    math = folder.area === 'maths';
  const files = Object.values(w.attachments)
      .filter((a) => a.folderId === folder.id && a.kind === 'practice')
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.createdAt - b.createdAt),
    tests = Object.values(w.tests)
      .filter((t) => t.folderId === folder.id)
      .sort((a, b) => b.createdAt - a.createdAt),
    selected = files.find((a) => a.id === selectedPdf),
    active = w.tests[activeId ?? ''],
    result = w.tests[resultId ?? ''];
  const refs = math
    ? ((tab === 'practice' ? w.mathPracticeBookmarks[folder.id] : w.mathTestBookmarks[folder.id]) ??
      [])
    : (w.bookmarks[folder.id] ?? []);
  const toggle = (ref: string, kind: 'practice' | 'test' = 'practice') => {
    void act(() =>
      commit((s) => {
        const key = math
          ? kind === 'practice'
            ? 'mathPracticeBookmarks'
            : 'mathTestBookmarks'
          : 'bookmarks';
        const list = s.monty![key][folder.id] ?? [];
        return {
          ...s,
          monty: {
            ...s.monty!,
            [key]: {
              ...s.monty![key],
              [folder.id]: list.includes(ref) ? list.filter((x) => x !== ref) : [...list, ref],
            },
          },
        };
      }),
    );
  };
  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not complete this action.');
    }
  }
  useEffect(() => {
    let valid = true;
    const id =
      active?.bankId ??
      result?.bankId ??
      (selectedPdf ? w.attachments[selectedPdf]?.bankId : undefined) ??
      review?.bankId;
    setBank(null);
    if (id)
      void readBank(id)
        .then((b) => {
          if (valid) setBank(b);
        })
        .catch((e) => notify(e.message));
    return () => {
      valid = false;
    };
  }, [active?.bankId, result?.bankId, selectedPdf, review?.bankId]);
  const navigate = (next: Tab) => {
    setTab(next);
    setSelectedPdf(null);
    setActiveId(null);
    setResultId(null);
    setAnalysis(false);
    setMathSaved(false);
    setLimit(30);
  };
  const patchTest = (id: string, update: (t: Exam) => Exam) =>
    commit((s) => {
      const t = s.monty!.tests[id];
      return t
        ? { ...s, monty: { ...s.monty!, tests: { ...s.monty!.tests, [id]: update(t) } } }
        : s;
    });
  async function start(t: Exam) {
    await patchTest(t.id, startExam);
    setActiveId(t.id);
    setResultId(null);
    setSelectedPdf(null);
    setAnalysis(false);
  }
  async function run(file?: File, id?: string) {
    if (controller.current) return;
    controller.current = new AbortController();
    try {
      if (file)
        await addPractice(
          file,
          folder,
          current,
          commit,
          (message, percent) => setProgress({ message, percent }),
          controller.current.signal,
        );
      else if (id)
        await importPractice(
          id,
          folder,
          current,
          commit,
          (message, percent) => setProgress({ message, percent }),
          controller.current.signal,
        );
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Import interrupted.');
    } finally {
      controller.current = null;
      setProgress(null);
    }
  }
  async function generate() {
    let questions: MCQ[] = [],
      study: StudyItem[] = [];
    if (bookmarkSource) {
      for (const ref of w.bookmarks[folder.id] ?? []) {
        const [id, , key] = ref.split('|');
        const b = await readBank(id);
        const q = b.questions.find((q) => q.id === key);
        if (q) questions.push(q);
      }
    } else
      for (const file of files.filter((f) => selection.includes(f.id) && f.bankId)) {
        const b = await readBank(file.bankId!);
        questions.push(...b.questions);
        study.push(...b.study);
      }
    const seen = new Set<string>();
    questions = questions.filter((q) => {
      const key = (q.stem + '|' + q.passage + '|' + q.options.map((o) => o.text).join('|'))
        .toLowerCase()
        .replace(/\s+/g, ' ');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const n = Number(count);
    if (!questions.length) throw new Error('Select PDFs or bookmarks with ready questions.');
    if (!Number.isInteger(n) || n < 0 || (custom && (n < 1 || n > questions.length)))
      throw new Error(`Choose 1–${questions.length} questions, or All.`);
    questions = shuffle(questions).slice(0, n || questions.length);
    const sizes = splitSizes(
      questions.length,
      !bookmarkSource && selection.length > 1 ? splits : 1,
    );
    const id = 'bank-' + uid(),
      combined: Bank = { version: 1, id, kind: 'general', questions, study, warnings: [] };
    await saveBank(combined);
    let offset = 0;
    const generated = sizes.map((size, i) => {
      const q = questions.slice(offset, offset + size);
      offset += size;
      return {
        id: uid(),
        folderId: folder.id,
        attachmentId: bookmarkSource
          ? 'bookmarks'
          : selection.length === 1
            ? selection[0]
            : 'combined',
        bankId: id,
        name:
          (bookmarkSource
            ? 'Bookmarks'
            : selection.length > 1
              ? `Combined · ${selection.length} PDFs`
              : (files.find((f) => f.id === selection[0])?.name ?? 'Quiz')) +
          (sizes.length > 1 ? ` · ${i + 1}/${sizes.length}` : ''),
        questionIds: q.map((q) => q.id),
        createdAt: Date.now(),
        source: bookmarkSource
          ? ('bookmarks' as const)
          : selection.length > 1
            ? ('combined' as const)
            : ('pdf' as const),
      };
    });
    await commit((s) => ({
      ...s,
      monty: {
        ...s.monty!,
        banks: {
          ...s.monty!.banks,
          [id]: { id, kind: 'general', count: questions.length, studyCount: study.length },
        },
        tests: {
          ...s.monty!.tests,
          ...Object.fromEntries(generated.map((t, i) => [t.id, i === 0 ? startExam(t) : t])),
        },
      },
    }));
    setActiveId(generated[0].id);
    setBank(combined);
    setResultId(null);
  }
  async function deleteFile(file: Attachment) {
    if (!confirm(`Delete “${file.name}”? Existing tests and their results will remain.`)) return;
    await commit((s) => {
      const attachments = { ...s.monty!.attachments };
      delete attachments[file.id];
      return { ...s, monty: { ...s.monty!, attachments } };
    });
    await removeAttachment(file.id);
  }
  const testCard = (t: Exam) => (
    <article className="test-card" key={t.id}>
      <div className="card-heading">
        <div>
          <h3>{t.name}</h3>
          <p className="muted">{t.questionIds.length} questions · 15 min</p>
          {t.draft && <small>Paused · {time(t.draft.clock.remainingMs)} remaining</small>}
        </div>
        <button
          className="icon-button delete"
          aria-label={`Delete test ${t.name}`}
          onClick={() => {
            if (confirm(`Permanently delete “${t.name}” and its result?`))
              void act(() =>
                commit((s) => {
                  const tests = { ...s.monty!.tests };
                  delete tests[t.id];
                  return { ...s, monty: { ...s.monty!, tests } };
                }),
              );
          }}
        >
          <Trash2 size={16} />
        </button>
      </div>
      {t.draft ? (
        <button
          className="primary full"
          onClick={() => {
            setActiveId(t.id);
            setSelectedPdf(null);
            setResultId(null);
          }}
        >
          Resume test
        </button>
      ) : !t.latest ? (
        <button className="primary full" onClick={() => void act(() => start(t))}>
          Start test
        </button>
      ) : null}
      {t.latest && (
        <>
          <p className="test-score">
            {t.latest.correct}/{t.latest.total} · {t.latest.wrong} wrong · {t.latest.unanswered}{' '}
            unanswered
          </p>
          <div className="test-actions">
            <button
              className="secondary"
              onClick={() => {
                setResultId(t.id);
                setActiveId(null);
                setSelectedPdf(null);
                setAnalysis(false);
              }}
            >
              Result
            </button>
            <button
              className="secondary"
              onClick={() => {
                setResultId(t.id);
                setActiveId(null);
                setSelectedPdf(null);
                setAnalysis(true);
              }}
            >
              Analyse
            </button>
            <button
              className="text-button"
              onClick={() => {
                if (
                  !t.draft ||
                  confirm(
                    'Replace the unfinished attempt? Your latest result remains until submission.',
                  )
                )
                  void act(() => start(t));
              }}
            >
              Reattempt
            </button>
          </div>
        </>
      )}
    </article>
  );
  const bookmarkTest = (q: MCQ) => toggle(questionRef(bank!.id, q.id), 'test');
  const isTestSaved = (q: MCQ) =>
    (math ? w.mathTestBookmarks[folder.id] : w.bookmarks[folder.id])?.includes(
      questionRef(bank!.id, q.id),
    ) ?? false;
  if (active?.draft) {
    if (!bank) return <p>Opening saved questions…</p>;
    return (
      <ExamScreen
        test={active}
        bank={bank}
        onUpdate={(fn) => patchTest(active.id, fn)}
        onExit={() => setActiveId(null)}
        onFinished={() => {
          setResultId(active.id);
          setActiveId(null);
          setAnalysis(false);
        }}
        saved={isTestSaved}
        onBookmark={bookmarkTest}
      />
    );
  }
  if (result?.latest) {
    if (!bank) return <p>Opening result…</p>;
    return analysis ? (
      <ExamAnalysis
        key={result.id}
        initialIndex={analysisIndex}
        test={result}
        bank={bank}
        hide={state.settings.hideReviewAnswers}
        onHide={(hideReviewAnswers) =>
          void act(() => commit((s) => ({ ...s, settings: { ...s.settings, hideReviewAnswers } })))
        }
        onBack={() => setAnalysis(false)}
        saved={isTestSaved}
        onBookmark={bookmarkTest}
      />
    ) : (
      <>
        <button className="back-button" onClick={() => setResultId(null)}>
          <ArrowLeft size={17} /> {math ? 'Tests' : 'Results'}
        </button>
        <div className="result-summary">
          <span className="eyebrow">Test completed</span>
          <h1>{result.name}</h1>
          <div className="score">
            {result.latest.correct}
            <span>/{result.latest.total}</span>
          </div>
          <p>
            {result.latest.correct} correct · {result.latest.wrong} wrong ·{' '}
            {result.latest.unanswered} unanswered
          </p>
          <p>Time taken: {time(result.latest.elapsedMs)}</p>
        </div>
        <button className="primary full" onClick={() => setAnalysis(true)}>
          Analyse answers
        </button>
        <button className="secondary full" onClick={() => void act(() => start(result))}>
          Reattempt test
        </button>
        <div className="timing-list">
          <h2>Time per question</h2>
          {result.questionIds.map((id, i) => (
            <button
              key={id}
              onClick={() => {
                setAnalysisIndex(i);
                setAnalysis(true);
              }}
            >
              <span>Question {i + 1}</span>
              <strong>{time(result.latest!.spent[id] ?? 0)}</strong>
            </button>
          ))}
        </div>
      </>
    );
  }
  return (
    <>
      <div className="folder-toolbar">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={17} /> Folders
        </button>
        <span className="eyebrow">{folder.name}</span>
      </div>
      {progress && (
        <div className="import-progress" role="status">
          <div className="card-heading">
            <strong>{progress.message}</strong>
            <button className="text-button" onClick={() => controller.current?.abort()}>
              <Pause size={15} /> Pause
            </button>
          </div>
          <progress max={100} value={progress.percent} />
        </div>
      )}
      <div className="folder-content">
        {tab === 'notes' ? (
          <NotesPanel folderId={folder.id} state={state} commit={commit} notify={notify} />
        ) : tab === 'bookmarks' || mathSaved ? (
          <SavedQuestions
            refs={refs}
            onRemove={(ref) => toggle(ref, tab === 'quiz' ? 'test' : 'practice')}
            onBack={mathSaved ? () => setMathSaved(false) : undefined}
          />
        ) : tab === 'practice' ? (
          selectedPdf && selected && bank ? (
            <>
              <div className="page-heading">
                <button className="back-button" onClick={() => setSelectedPdf(null)}>
                  <ArrowLeft size={17} /> PDFs
                </button>
                <button className="text-button" onClick={() => void openPdfInApp(selected, notify)}>
                  Original PDF
                </button>
              </div>
              <h1 className="source-title">{selected.name}</h1>
              {bank.study.length > 0 && (
                <div className="segmented">
                  <button
                    className={studyMode ? 'selected' : ''}
                    onClick={() => setStudyMode(true)}
                  >
                    Study
                  </button>
                  <button
                    className={!studyMode ? 'selected' : ''}
                    onClick={() => setStudyMode(false)}
                  >
                    Questions
                  </button>
                </div>
              )}
              {studyMode && bank.study.length > 0 ? (
                <>
                  <div className="word-grid">
                    {bank.study.slice(0, limit).map((item) => {
                      const ref = questionRef(bank.id, item.id, bank.kind !== 'idioms'),
                        saved = refs.includes(ref);
                      return (
                        <article className="word-card" key={item.id}>
                          <div className="card-heading">
                            <h2>{item.title}</h2>
                            <button
                              className="icon-button bookmark"
                              aria-label={saved ? 'Remove bookmark' : 'Bookmark study card'}
                              onClick={() => toggle(ref)}
                            >
                              <Bookmark size={21} fill={saved ? 'currentColor' : 'none'} />
                            </button>
                          </div>
                          <StudyContent item={item} />
                        </article>
                      );
                    })}
                  </div>
                  {bank.study.length > limit && (
                    <button className="secondary full" onClick={() => setLimit((n) => n + 30)}>
                      Show more
                    </button>
                  )}
                </>
              ) : (
                <PracticeQuestions
                  key={selected.id}
                  attachment={selected}
                  bank={bank}
                  state={state}
                  commit={commit}
                  saved={(q) => refs.includes(questionRef(bank.id, q.id))}
                  onBookmark={(q) => toggle(questionRef(bank.id, q.id))}
                />
              )}
            </>
          ) : (
            <>
              <div className="page-heading">
                <h1>Practice</h1>
                <button
                  className="primary"
                  disabled={!!progress}
                  onClick={() => upload.current?.click()}
                >
                  <Plus size={17} /> Add PDF
                </button>
              </div>
              <input
                ref={upload}
                hidden
                multiple
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  void (async () => {
                    for (const file of picked) await run(file);
                  })();
                }}
              />
              {math && (
                <button className="secondary full" onClick={() => setMathSaved(true)}>
                  <Bookmark size={16} /> Practice bookmarks ({refs.length})
                </button>
              )}
              {!files.length && (
                <div className="empty-state">
                  <BookOpen size={32} />
                  <h2>No practice PDFs yet</h2>
                  <p>Add a PDF to extract its study content and questions.</p>
                </div>
              )}
              {files.map((file) => (
                <PdfCard
                  key={file.id}
                  name={file.name}
                  pinned={file.pinned}
                  summary={
                    <>
                      {file.count} questions · {file.status}
                    </>
                  }
                  disabled={!!progress}
                  onRename={() => {
                    const name = prompt('Rename PDF', file.name)?.trim();
                    if (name)
                      void act(() =>
                        commit((s) => ({
                          ...s,
                          monty: {
                            ...s.monty!,
                            attachments: {
                              ...s.monty!.attachments,
                              [file.id]: { ...s.monty!.attachments[file.id], name },
                            },
                          },
                        })),
                      );
                  }}
                  onPin={() =>
                    void act(() =>
                      commit((s) => ({
                        ...s,
                        monty: {
                          ...s.monty!,
                          attachments: {
                            ...s.monty!.attachments,
                            [file.id]: { ...s.monty!.attachments[file.id], pinned: !file.pinned },
                          },
                        },
                      })),
                    )
                  }
                  onDelete={() => void act(() => deleteFile(file))}
                >
                  {file.error && <p className="document-note">{file.error}</p>}
                  {math && w.practice[file.id] && (
                    <p className="practice-card-progress">
                      {Object.values(w.practice[file.id].answers).filter(Boolean).length} /{' '}
                      {file.count} answered
                    </p>
                  )}
                  <div className="document-actions">
                    {file.bankId && (
                      <button
                        className="primary"
                        onClick={() => {
                          setSelectedPdf(file.id);
                          setStudyMode(!math);
                        }}
                      >
                        Practice
                      </button>
                    )}
                    <button className="secondary" onClick={() => void openPdfInApp(file, notify)}>
                      Open PDF
                    </button>
                    {file.bankId && (
                      <button className="text-button" onClick={() => setReview(file)}>
                        Review / edit
                      </button>
                    )}
                    {file.status !== 'ready' && (
                      <button
                        className="text-button"
                        disabled={!!progress}
                        onClick={() => void run(undefined, file.id)}
                      >
                        Resume import
                      </button>
                    )}
                  </div>
                </PdfCard>
              ))}
            </>
          )
        ) : tab === 'quiz' ? (
          <>
            <div className="page-heading">
              <h1>{math ? 'Tests' : 'Quiz'}</h1>
              {math && (
                <button className="secondary" onClick={() => setMathSaved(true)}>
                  <Bookmark size={15} /> Test bookmarks
                </button>
              )}
            </div>
            {!math && (
              <>
                <section className="panel quiz-setup">
                  <h2>New test</h2>
                  <div className="segmented">
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
                      Bookmarks
                    </button>
                  </div>
                  {bookmarkSource ? (
                    <p className="muted">
                      {(w.bookmarks[folder.id] ?? []).length} saved items. Questions with ready
                      options are included.
                    </p>
                  ) : (
                    <div className="pdf-checklist">
                      {files
                        .filter((f) => f.bankId)
                        .map((f) => (
                          <label className="pdf-check" key={f.id}>
                            <input
                              type="checkbox"
                              checked={selection.includes(f.id)}
                              onChange={(e) =>
                                setSelection((s) =>
                                  e.target.checked ? [...s, f.id] : s.filter((id) => id !== f.id),
                                )
                              }
                            />
                            <span>
                              {f.name}
                              <small>{f.count} questions</small>
                            </span>
                          </label>
                        ))}
                    </div>
                  )}
                  <label className="field-label">Number of questions</label>
                  <div className="segmented counts">
                    {['10', '20', '0'].map((n) => (
                      <button
                        key={n}
                        className={!custom && count === n ? 'selected' : ''}
                        onClick={() => {
                          setCustom(false);
                          setCount(n);
                        }}
                      >
                        {n === '0' ? 'All' : n}
                      </button>
                    ))}
                    <button
                      className={custom ? 'selected' : ''}
                      onClick={() => {
                        setCustom(true);
                        setCount('');
                      }}
                    >
                      Custom
                    </button>
                  </div>
                  {custom && (
                    <label className="field">
                      Custom questions
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={count}
                        onChange={(e) => setCount(e.target.value)}
                      />
                    </label>
                  )}
                  {!bookmarkSource && selection.length > 1 && (
                    <label className="field">
                      Split tests
                      <select value={splits} onChange={(e) => setSplits(Number(e.target.value))}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n === 1 ? 'One combined test' : n + ' tests'}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <p className="muted">15 minutes per test · answers after submission</p>
                  <button className="primary full" onClick={() => void act(generate)}>
                    Generate & start
                  </button>
                </section>
                {tests.filter((t) => t.draft || !t.latest).map(testCard)}
              </>
            )}
            {math && (
              <>
                {files.map((file) => {
                  const group = tests.filter((t) => t.attachmentId === file.id);
                  return (
                    <section key={file.id} className="pdf-test-group">
                      <h2>{file.name}</h2>
                      <p className="muted">
                        {group.length} separate tests · up to 25 questions each
                      </p>
                      {group.map(testCard)}
                      {!group.length && (
                        <p className="notice">
                          Finish importing and reviewing this PDF to create its tests.
                        </p>
                      )}
                    </section>
                  );
                })}
                {tests.filter((t) => !files.some((f) => f.id === t.attachmentId)).map(testCard)}
                {!tests.length && !files.length && (
                  <p className="empty-state">
                    Add a PDF in Practice. Its tests appear here automatically.
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <h1>Results</h1>
            {tests.filter((t) => t.latest).map(testCard)}
            {!tests.some((t) => t.latest) && (
              <p className="empty-state">Complete a test in this folder to see its result here.</p>
            )}
          </>
        )}
      </div>
      <nav className="folder-nav" aria-label="Folder navigation">
        {(math
          ? [
              ['notes', 'Notes', StickyNote],
              ['practice', 'Practice', BookOpen],
              ['quiz', 'Tests', ClipboardList],
            ]
          : [
              ['notes', 'Notes', StickyNote],
              ['practice', 'Practice', BookOpen],
              ['quiz', 'Quiz', ClipboardList],
              ['bookmarks', 'Bookmarks', Bookmark],
              ['results', 'Results', BarChart3],
            ]
        ).map(([key, label, Icon]: any) => (
          <button
            key={key}
            aria-current={tab === key ? 'page' : undefined}
            className={tab === key ? 'active' : ''}
            onClick={() => navigate(key)}
          >
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {review && bank && (
        <BankEditor
          bank={bank}
          onClose={() => setReview(null)}
          onSave={async (next) => {
            await saveBank(next);
            await commit((s) => {
              const tests = { ...s.monty!.tests };
              if (math)
                for (const t of mathsTests(next, folder.id, review.id, review.name)) {
                  const id =
                    tests[t.id] && tests[t.id].bankId !== next.id ? t.id + '-' + next.id : t.id;
                  tests[id] = { ...t, id };
                }
              return {
                ...s,
                monty: {
                  ...s.monty!,
                  banks: {
                    ...s.monty!.banks,
                    [next.id]: {
                      id: next.id,
                      kind: next.kind,
                      count: next.questions.length,
                      studyCount: next.study.length,
                    },
                  },
                  tests,
                  attachments: {
                    ...s.monty!.attachments,
                    [review.id]: {
                      ...s.monty!.attachments[review.id],
                      bankId: next.id,
                      status: 'ready',
                      count: next.questions.length,
                      error: undefined,
                    },
                  },
                },
              };
            });
            notify('Reviewed question bank saved. Existing tests remain unchanged.');
          }}
        />
      )}
    </>
  );
}
function PracticeQuestions({
  attachment,
  bank,
  state,
  commit,
  saved,
  onBookmark,
}: {
  attachment: Attachment;
  bank: Bank;
  state: State;
  commit: Commit;
  saved: (q: MCQ) => boolean;
  onBookmark: (q: MCQ) => void;
}) {
  const progress = state.monty!.practice[attachment.id] ?? { index: 0, answers: {}, updatedAt: 0 };
  const [index, setIndex] = useState(() =>
    bank.kind === 'maths'
      ? resumePractice(bank.questions, progress.answers, progress.index)
      : Math.max(0, Math.min(progress.index, bank.questions.length - 1)),
  );
  const q = bank.questions[index];
  const visited = [...new Set([...(progress.visited ?? []), ...(q ? [q.id] : [])])];
  const update = (patch: Partial<typeof progress>) =>
    commit((s) => ({
      ...s,
      monty: {
        ...s.monty!,
        practice: {
          ...s.monty!.practice,
          [attachment.id]: {
            ...(s.monty!.practice[attachment.id] ?? progress),
            ...patch,
            updatedAt: Date.now(),
          },
        },
      },
    }));
  if (!q) return <p>No ready questions. Review this PDF first.</p>;
  const move = (next: number) => {
    setIndex(next);
    void update({ index: next, visited: [...new Set([...visited, bank.questions[next].id])] });
    document.querySelector('main')?.scrollTo({ top: 0 });
  };
  return (
    <>
      {bank.kind === 'maths' && (
        <QuestionTracker
          practice
          ids={bank.questions.map((q) => q.id)}
          index={index}
          answered={(id) =>
            bank.questions
              .find((q) => q.id === id)!
              .options.some((o) => o.id === progress.answers[id])
          }
          visited={visited}
          onNavigate={move}
        />
      )}
      <div className="question-meta">
        {bank.kind !== 'maths' ? (
          <label>
            Question{' '}
            <select
              aria-label="Practice question"
              value={index}
              onChange={(e) => move(Number(e.target.value))}
            >
              {bank.questions.map((q, i) => (
                <option key={q.id} value={i}>
                  {i + 1}
                </option>
              ))}
            </select>{' '}
            / {bank.questions.length}
          </label>
        ) : (
          <span className="eyebrow">Practice · progress saves automatically</span>
        )}
        <button
          className="icon-button bookmark"
          aria-label={saved(q) ? 'Remove practice bookmark' : 'Bookmark practice question'}
          aria-pressed={saved(q)}
          onClick={() => onBookmark(q)}
        >
          <Bookmark size={21} fill={saved(q) ? 'currentColor' : 'none'} />
        </button>
      </div>
      <MCQView
        maths={bank.kind === 'maths'}
        question={q}
        selected={progress.answers[q.id]}
        reveal={!!progress.answers[q.id]}
        disabled={!!progress.answers[q.id]}
        onSelect={(answer) =>
          void update({ index, visited, answers: { ...progress.answers, [q.id]: answer } })
        }
      />
      {progress.answers[q.id] && (
        <button
          className="text-button"
          onClick={() => {
            const answers = { ...progress.answers };
            delete answers[q.id];
            void update({ index, visited, answers });
          }}
        >
          Try this question again
        </button>
      )}
      <div className="question-nav">
        <button className="secondary" disabled={!index} onClick={() => move(index - 1)}>
          <ArrowLeft size={16} /> Previous
        </button>
        <button
          className="primary"
          disabled={index === bank.questions.length - 1}
          onClick={() => move(index + 1)}
        >
          Next <ArrowRight size={16} />
        </button>
      </div>
    </>
  );
}
