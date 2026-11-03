import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronRight,
  Eraser,
  Expand,
  FileText,
  Flag,
  Home,
  LayoutGrid,
  Minimize,
  Pause,
  UserRound,
  X,
} from 'lucide-react';
import { examPalette, examStatuses } from '../core/computerExam';
import { time } from '../core/exams';
import type { useAttemptClock } from './useAttemptClock';

export function ComputerExam({
  title,
  section,
  ids,
  index,
  answered,
  visited,
  marked,
  timer,
  saved,
  onBookmark,
  onMove,
  onSaveNext,
  onReviewNext,
  onClear,
  hasAnswer,
  onExit,
  onHome,
  onSubmit,
  children,
}: {
  title: string;
  section: string;
  ids: string[];
  index: number;
  answered: (id: string) => boolean;
  visited?: string[];
  marked?: string[];
  timer: ReturnType<typeof useAttemptClock>;
  saved: boolean;
  onBookmark: () => void;
  onMove: (index: number) => Promise<unknown>;
  onSaveNext: () => Promise<unknown>;
  onReviewNext: () => Promise<unknown>;
  onClear: () => Promise<unknown>;
  hasAnswer: boolean;
  onExit: () => void;
  onHome: () => void;
  onSubmit: () => Promise<unknown>;
  children: ReactNode;
}) {
  const palette = useRef<HTMLDialogElement>(null),
    instructions = useRef<HTMLDialogElement>(null),
    summary = useRef<HTMLDialogElement>(null),
    questionPane = useRef<HTMLDivElement>(null);
  const scrollRail = useRef<HTMLDivElement>(null);
  const sidebarId = useId();
  const [desktopQuirks, setDesktopQuirks] = useState(false),
    [paletteCollapsed, setPaletteCollapsed] = useState(false),
    [railBounds, setRailBounds] = useState({ top: 0, height: 0, contentHeight: 0 });
  const [working, setWorking] = useState(false),
    [error, setError] = useState(''),
    [fullScreen, setFullScreen] = useState(false),
    [savedLast, setSavedLast] = useState(false);
  const { items, counts } = examPalette(ids, answered, visited, marked, ids[index]);
  const totalAnswered = items.filter((q) => q.answered).length;
  const run = async (fn: () => Promise<unknown>) => {
    if (working) return;
    setWorking(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your response. Please retry.');
    } finally {
      setWorking(false);
    }
  };
  useEffect(() => {
    questionPane.current?.scrollTo({ top: 0 });
    setSavedLast(false);
  }, [index]);
  useEffect(() => {
    // This deliberately awkward training layout is for mouse/trackpad desktop
    // browsers only. Native Android and touch-first web layouts stay unchanged.
    if (Capacitor.isNativePlatform()) return;
    const media = matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
    const update = () => {
      setDesktopQuirks(media.matches);
      if (!media.matches) setPaletteCollapsed(false);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!desktopQuirks || !questionPane.current) return;
    const pane = questionPane.current;
    const measure = () => {
      const body = pane.closest('.cbt-body');
      if (!body) return;
      const next = {
        top: pane.getBoundingClientRect().top - body.getBoundingClientRect().top,
        height: pane.clientHeight,
        contentHeight: pane.scrollHeight,
      };
      setRailBounds((old) =>
        old.top === next.top &&
        old.height === next.height &&
        old.contentHeight === next.contentHeight
          ? old
          : next,
      );
      if (scrollRail.current) scrollRail.current.scrollTop = pane.scrollTop;
    };
    const resize = new ResizeObserver(measure);
    const observe = () => {
      resize.disconnect();
      resize.observe(pane);
      for (const child of pane.children) resize.observe(child);
      measure();
    };
    const mutation = new MutationObserver(observe);
    mutation.observe(pane, { childList: true, subtree: true, characterData: true });
    observe();
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, [desktopQuirks, paletteCollapsed]);
  useEffect(() => {
    const media = matchMedia('(min-width: 1024px)');
    const resize = () => {
      if (media.matches) palette.current?.close();
    };
    media.addEventListener('change', resize);
    const fullscreen = () => setFullScreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fullscreen);
    return () => {
      media.removeEventListener('change', resize);
      document.removeEventListener('fullscreenchange', fullscreen);
    };
  }, []);
  const move = (next: number) => {
    palette.current?.close();
    void run(() => onMove(next));
  };
  const legend = (
    <div className="cbt-legend" aria-label="Question status legend">
      {examStatuses.map(([status, label]) => (
        <div key={status}>
          <span className={'cbt-number ' + status}>{counts[status]}</span>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
  const numbers = (
    <nav className="cbt-numbers" aria-label="Question palette">
      {items.map((q, i) => (
        <button
          type="button"
          key={q.id}
          disabled={working}
          className={'cbt-number ' + q.status}
          aria-label={`Question ${i + 1}, ${examStatuses.find(([s]) => s === q.status)![1].toLowerCase()}`}
          aria-current={i === index ? 'step' : undefined}
          onClick={() => move(i)}
        >
          {i + 1}
          {q.status === 'answered-review' && <Check size={12} />}
        </button>
      ))}
    </nav>
  );
  const submitButton = (
    <button
      className="cbt-button cbt-blue cbt-submit"
      disabled={working}
      onClick={() => summary.current?.showModal()}
    >
      Submit test
    </button>
  );
  return (
    <div
      className={
        'exam-page cbt-exam' +
        (desktopQuirks ? ' cbt-desktop-quirks' : '') +
        (desktopQuirks && paletteCollapsed ? ' is-palette-collapsed' : '')
      }
    >
      <header className="cbt-header">
        <div className="cbt-brand">
          <strong>Monty</strong>
          <span>Computer based practice test</span>
        </div>
        <div className="cbt-header-tools">
          <button
            className="cbt-header-button cbt-home"
            aria-label="Home"
            title="Save attempt and return home"
            onClick={() =>
              void run(async () => {
                await timer.pause();
                onHome();
              })
            }
            disabled={working}
          >
            <Home size={16} />
            <span>Home</span>
          </button>
          {document.fullscreenEnabled && (
            <button
              className="cbt-header-button cbt-fullscreen"
              aria-label={fullScreen ? 'Exit full screen' : 'Enter full screen'}
              onClick={() =>
                void run(() =>
                  document.fullscreenElement
                    ? document.exitFullscreen()
                    : document.documentElement.requestFullscreen(),
                )
              }
            >
              {fullScreen ? <Minimize size={17} /> : <Expand size={17} />}
            </button>
          )}
          <button className="cbt-header-button" onClick={() => instructions.current?.showModal()}>
            <FileText size={16} />
            <span>Instructions</span>
          </button>
          <button
            className="cbt-header-button"
            disabled={working}
            onClick={() =>
              void run(async () => {
                await timer.pause();
                onExit();
              })
            }
          >
            <Pause size={16} />
            <span>Save & exit</span>
          </button>
        </div>
      </header>
      <div className="cbt-test-title">
        <span>{title}</span>
        <span className="cbt-practice-label">Practice test</span>
      </div>
      <div className="cbt-section-bar">
        <div className="cbt-section">
          <small>Section</small>
          <strong>{section}</strong>
        </div>
        <div className={'cbt-clock ' + (timer.remaining < 60000 ? 'urgent' : '')}>
          <span>Time left</span>
          <strong role="timer">{time(timer.remaining)}</strong>
        </div>
        <button
          className="cbt-button cbt-palette-toggle"
          aria-haspopup="dialog"
          onClick={() => palette.current?.showModal()}
        >
          <LayoutGrid size={17} />
          <span>Palette</span>
        </button>
      </div>
      <div className="cbt-body">
        <section className="cbt-workspace" aria-label="Exam question">
          <div className="cbt-question-bar">
            <strong>Question No. {index + 1}</strong>
            <span className="cbt-question-type">
              {section === 'Vocabulary' ? 'Word classification' : 'Multiple choice question'}
            </span>
            <button
              className="cbt-bookmark"
              aria-label={saved ? 'Remove test bookmark' : 'Bookmark test question'}
              aria-pressed={saved}
              onClick={onBookmark}
            >
              <Bookmark size={18} fill={saved ? 'currentColor' : 'none'} />
            </button>
          </div>
          <div
            className="cbt-question-scroll"
            ref={questionPane}
            onScroll={() => {
              if (desktopQuirks && scrollRail.current && questionPane.current)
                scrollRail.current.scrollTop = questionPane.current.scrollTop;
            }}
          >
            {timer.paused && (
              <div className="cbt-paused" role="status">
                <strong>
                  {timer.busy ? 'This attempt is open in another tab.' : 'Test paused'}
                </strong>
                <button
                  className="cbt-button cbt-blue"
                  disabled={working || timer.busy}
                  onClick={() => void run(timer.resume)}
                >
                  Resume timer
                </button>
              </div>
            )}
            {error && (
              <p className="cbt-error" role="alert">
                {error}
              </p>
            )}
            {children}
            {savedLast && (
              <p className="cbt-saved" role="status">
                Last response saved. Review the palette or submit your test.
              </p>
            )}
          </div>
          <div className="cbt-question-footer">
            <div className="cbt-response-actions">
              <button
                className="cbt-button cbt-review"
                disabled={working || timer.paused}
                onClick={() => void run(onReviewNext)}
              >
                <Flag size={15} />
                <span>Mark for Review & Next</span>
              </button>
              <button
                className="cbt-button"
                disabled={working || timer.paused || !hasAnswer}
                onClick={() => void run(onClear)}
              >
                <Eraser size={15} />
                <span>Clear Response</span>
              </button>
              <button
                className="cbt-button cbt-blue cbt-save"
                disabled={working || timer.paused}
                onClick={() =>
                  void run(async () => {
                    await onSaveNext();
                    if (index === ids.length - 1) setSavedLast(true);
                  })
                }
              >
                Save & Next
                <ChevronRight size={17} />
              </button>
            </div>
            <div className="cbt-secondary-actions">
              <button
                className="cbt-link"
                disabled={working || index === 0}
                onClick={() => move(index - 1)}
              >
                <ArrowLeft size={14} />
                Previous
              </button>
              <span>
                Question {index + 1} of {ids.length}
              </span>
              <button
                className="cbt-link"
                disabled={working || index === ids.length - 1}
                onClick={() => move(index + 1)}
              >
                Next
                <ArrowRight size={14} />
              </button>
              <button
                className="cbt-link cbt-mobile-submit"
                disabled={working}
                onClick={() => summary.current?.showModal()}
              >
                Submit test
              </button>
            </div>
          </div>
        </section>
        {desktopQuirks && (
          <>
            <div
              className="cbt-simulation-scrollbar"
              ref={scrollRail}
              aria-hidden="true"
              style={{ top: railBounds.top, height: railBounds.height }}
              onScroll={() => {
                if (questionPane.current && scrollRail.current)
                  questionPane.current.scrollTop = scrollRail.current.scrollTop;
              }}
            >
              <div style={{ height: railBounds.contentHeight }} />
            </div>
            <button
              type="button"
              className="cbt-palette-collapse"
              aria-label={
                paletteCollapsed ? 'Expand question palette' : 'Collapse question palette'
              }
              title={paletteCollapsed ? 'Expand question palette' : 'Collapse question palette'}
              aria-controls={sidebarId}
              aria-expanded={!paletteCollapsed}
              onClick={() => setPaletteCollapsed((value) => !value)}
            />
          </>
        )}
        <aside id={sidebarId} className="cbt-sidebar" aria-label="Exam overview">
          <div className="cbt-candidate">
            <span className="cbt-avatar">
              <UserRound size={32} />
            </span>
            <div>
              <strong>Practice candidate</strong>
              <small>Monty exam practice</small>
            </div>
          </div>
          {legend}
          <div className="cbt-palette-title">
            {section}
            <span>Question palette</span>
          </div>
          <div className="cbt-sidebar-scroll">{numbers}</div>
          <div className="cbt-sidebar-bottom">
            <p>Answered questions marked for review are also evaluated.</p>
            {submitButton}
          </div>
        </aside>
      </div>
      <dialog
        ref={palette}
        className="cbt-dialog cbt-mobile-palette"
        aria-labelledby="cbt-palette-heading"
      >
        <div className="cbt-dialog-heading">
          <h2 id="cbt-palette-heading">Question palette</h2>
          <button
            className="cbt-icon"
            aria-label="Close question palette"
            onClick={() => palette.current?.close()}
            autoFocus
          >
            <X size={21} />
          </button>
        </div>
        <div className="cbt-dialog-scroll">
          {legend}
          {numbers}
        </div>
        <div className="cbt-dialog-footer">{submitButton}</div>
      </dialog>
      <dialog ref={instructions} className="cbt-dialog" aria-labelledby="cbt-instructions-heading">
        <div className="cbt-dialog-heading">
          <h2 id="cbt-instructions-heading">Test instructions</h2>
          <button
            className="cbt-icon"
            aria-label="Close instructions"
            onClick={() => instructions.current?.close()}
            autoFocus
          >
            <X size={21} />
          </button>
        </div>
        <div className="cbt-dialog-scroll">
          <p>
            Select your answer, then use <strong>Save & Next</strong> to continue. Responses are
            also saved automatically to protect your progress.
          </p>
          <p>
            <strong>Mark for Review & Next</strong> keeps your response, flags the question and
            advances. Use Save & Next on a reviewed question to remove its review flag.
          </p>
          <p>
            <strong>Clear Response</strong> removes the selected answer. The palette lets you jump
            to any question.
          </p>
          <p>
            Answered questions marked for review are evaluated. Unanswered questions are left
            unanswered. No correct answers are shown until submission.
          </p>
          <p>
            The timer pauses when you save and exit or leave the app. When time runs out, saved
            answers are submitted automatically.
          </p>
          {legend}
        </div>
      </dialog>
      <dialog ref={summary} className="cbt-dialog" aria-labelledby="cbt-summary-heading">
        <div className="cbt-dialog-heading">
          <h2 id="cbt-summary-heading">Submit your test?</h2>
          <button
            className="cbt-icon"
            aria-label="Close submission summary"
            disabled={working}
            onClick={() => summary.current?.close()}
            autoFocus
          >
            <X size={21} />
          </button>
        </div>
        <div className="cbt-dialog-scroll">
          <p>
            <strong>{totalAnswered} answered</strong> · {ids.length - totalAnswered} unanswered ·{' '}
            {items.filter((q) => q.marked).length} marked for review
          </p>
          {legend}
          <p>
            Answered questions marked for review will also be scored. You can return to the test to
            check your responses before submitting.
          </p>
          {error && (
            <p className="cbt-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="cbt-dialog-footer">
          <button
            className="cbt-button"
            disabled={working}
            onClick={() => summary.current?.close()}
          >
            Return to test
          </button>
          <button
            className="cbt-button cbt-blue"
            disabled={working}
            onClick={() => void run(onSubmit)}
          >
            {working ? 'Submitting…' : 'Confirm submission'}
          </button>
        </div>
      </dialog>
    </div>
  );
}
