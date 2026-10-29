import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Flag, Check, ArrowLeft, ArrowRight, Eraser, Send, LayoutGrid, X } from 'lucide-react';
import { questionProgress } from '../core/questionProgress';

export function QuestionTracker({
  ids,
  index,
  answered,
  visited,
  marked,
  onNavigate,
  practice = false,
}: {
  ids: string[];
  index: number;
  answered: (id: string) => boolean;
  visited?: string[];
  marked?: string[];
  onNavigate: (index: number) => void;
  practice?: boolean;
}) {
  const items = questionProgress(ids, answered, visited, marked, ids[index]);
  const count = items.filter((q) => q.answered).length;
  const panelId = useId();
  const panel = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => panel.current?.close();
  const jump = (next: number) => {
    close();
    onNavigate(next);
  };
  const [dock, setDock] = useState<Element | null>(null);
  useEffect(() => {
    setDock(document.querySelector(practice ? '.folder-nav' : '.app-shell'));
  }, [practice]);
  const position = (
    <div className="question-position">
      <label>
        Question{' '}
        <select
          aria-label={practice ? 'Practice question' : 'Test question'}
          value={index}
          onChange={(e) => onNavigate(Number(e.target.value))}
        >
          {items.map((q, i) => (
            <option key={q.id} value={i}>
              {i + 1}
            </option>
          ))}
        </select>{' '}
        of {ids.length}
      </label>
    </div>
  );
  const button = (
    <button
      ref={launcher}
      className="palette-launcher"
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={() => {
        panel.current?.showModal();
        setOpen(true);
      }}
    >
      <LayoutGrid size={18} />
      <span>Palette</span>
    </button>
  );
  return (
    <>
      {practice && position}
      {dock &&
        createPortal(
          practice ? (
            button
          ) : (
            <div className="question-palette-dock">
              {position}
              {button}
            </div>
          ),
          dock,
        )}
      <dialog
        ref={panel}
        id={panelId}
        className="palette-sheet"
        aria-labelledby={panelId + '-title'}
        aria-describedby={panelId + '-hint'}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        onClose={() => {
          setOpen(false);
          launcher.current?.focus({ preventScroll: true });
        }}
      >
        <div className="palette-sheet-header">
          <div>
            <h2 id={panelId + '-title'}>Question palette</h2>
            <p>
              {practice ? 'Practice' : 'Quiz'} · Question {index + 1} of {ids.length}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close question palette"
            onClick={close}
            autoFocus
          >
            <X size={22} />
          </button>
        </div>
        <div className="palette-sheet-content">
          <section aria-label={practice ? 'Practice progress' : 'Quiz progress'}>
            <strong>
              {count} / {ids.length} answered
            </strong>
            <progress aria-label="Answered questions" value={count} max={ids.length} />
            <div className="tracker-counts">
              <span className="answered">
                <b>{count}</b> Answered
              </span>
              <span className="unanswered">
                <b>{items.filter((q) => q.visited && !q.answered).length}</b> Not answered
              </span>
              {!practice && (
                <span className="marked">
                  <b>{items.filter((q) => q.marked).length}</b> For review
                </span>
              )}
              <span className="unvisited">
                <b>{items.filter((q) => !q.visited).length}</b> Not visited
              </span>
            </div>
          </section>
          <p className="palette-hint" id={panelId + '-hint'}>
            Tap a number to open a question. Your current question has an outline.
          </p>
          <div className="palette-grid" aria-label="Question palette">
            {items.map((q, i) => (
              <button
                key={q.id}
                type="button"
                className={
                  'palette-question ' +
                  (q.answered ? 'answered' : q.visited ? 'unanswered' : 'unvisited') +
                  (q.marked ? ' marked' : '')
                }
                aria-label={`Question ${i + 1}, ${q.answered ? 'answered' : q.visited ? 'not answered' : 'not visited'}${q.marked ? ', marked for review' : ''}`}
                aria-current={i === index ? 'step' : undefined}
                onClick={() => jump(i)}
              >
                {i + 1}
                {q.marked && <Flag size={10} />}
                {q.marked && q.answered && <Check size={10} className="palette-answered" />}
              </button>
            ))}
          </div>
        </div>
      </dialog>
    </>
  );
}

export function ExamActions({
  index,
  total,
  marked,
  paused,
  hasAnswer,
  onMove,
  onClear,
  onMark,
  onSubmit,
}: {
  index: number;
  total: number;
  marked: boolean;
  paused: boolean;
  hasAnswer: boolean;
  onMove: (index: number) => void;
  onClear: () => void;
  onMark: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="exam-actions" aria-label="Exam controls">
      <button className="secondary" disabled={!index} onClick={() => onMove(index - 1)}>
        <ArrowLeft size={16} /> Previous
      </button>
      <button className="secondary" disabled={paused || !hasAnswer} onClick={onClear}>
        <Eraser size={16} /> Clear
      </button>
      <button
        className={'secondary review-action ' + (marked ? 'is-marked' : '')}
        disabled={paused}
        aria-pressed={marked}
        onClick={onMark}
      >
        <Flag size={16} /> {marked ? 'Unmark review' : 'Mark for review'}
      </button>
      <button
        className="primary"
        disabled={paused || index >= total - 1}
        onClick={() => onMove(index + 1)}
      >
        <Check size={16} /> Save & next
      </button>
      <button className="secondary" disabled={index >= total - 1} onClick={() => onMove(index + 1)}>
        Next <ArrowRight size={16} />
      </button>
      <button className="primary submit-action" disabled={paused} onClick={onSubmit}>
        <Send size={16} /> Submit test
      </button>
    </div>
  );
}
