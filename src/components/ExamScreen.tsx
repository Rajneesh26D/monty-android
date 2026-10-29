import { useState } from 'react';
import { ArrowLeft, Pause, Play, Bookmark } from 'lucide-react';
import type { Bank, Exam, AttemptClock, MCQ } from '../../shared/monty';
import { finishExam, time } from '../core/exams';
import { useAttemptClock } from './useAttemptClock';
import { MCQView } from './MCQView';
import { QuestionTracker, ExamActions } from './QuestionTracker';
export function ExamScreen({
  test,
  bank,
  onUpdate,
  onExit,
  onFinished,
  saved,
  onBookmark,
}: {
  test: Exam;
  bank: Bank;
  onUpdate: (fn: (t: Exam) => Exam) => Promise<unknown>;
  onExit: () => void;
  onFinished: () => void;
  saved: (q: MCQ) => boolean;
  onBookmark: (q: MCQ) => void;
}) {
  const draft = test.draft!,
    question = bank.questions.find((q) => q.id === test.questionIds[draft.index])!;
  const persist = async (clock: AttemptClock) =>
    onUpdate((t) => (t.draft?.id === draft.id ? { ...t, draft: { ...t.draft, clock } } : t));
  const finish = async (clock: AttemptClock) => {
    await onUpdate((t) =>
      t.draft?.id === draft.id ? finishExam({ ...t, draft: { ...t.draft, clock } }, bank) : t,
    );
    onFinished();
  };
  const timer = useAttemptClock(draft.id, question.id, draft.clock, persist, finish);
  const change = (fn: (d: NonNullable<Exam['draft']>) => NonNullable<Exam['draft']>) =>
    onUpdate((t) =>
      t.draft?.id === draft.id
        ? { ...t, draft: fn({ ...t.draft, clock: { ...timer.capture()! } }) }
        : t,
    );
  async function move(index: number) {
    await change((d) => ({
      ...d,
      index,
      visited: [...new Set([...(d.visited ?? []), question.id, test.questionIds[index]])],
    }));
    document.querySelector('main')?.scrollTo({ top: 0 });
  }
  const answered = test.questionIds.filter((id) => !!draft.answers[id]).length;
  return (
    <div className="exam-page">
      <div className="exam-toolbar">
        <button className="back-button" onClick={() => void timer.pause().then(onExit)}>
          <Pause size={16} /> Save & exit
        </button>
        <div className="quiz-status">
          <span className="quiz-position">
            Question {draft.index + 1} of {test.questionIds.length}
          </span>
          <strong className={timer.remaining < 60000 ? 'timer urgent' : 'timer'} role="timer">
            {time(timer.remaining)}
          </strong>
        </div>
      </div>
      <p className="eyebrow">{test.name}</p>
      <QuestionTracker
        ids={test.questionIds}
        index={draft.index}
        answered={(id) => !!draft.answers[id]}
        visited={draft.visited}
        marked={draft.marked}
        onNavigate={(index) => void move(index)}
      />
      {timer.paused && (
        <div className="notice">
          <strong>
            {timer.busy
              ? 'This test is open in another tab. Close or pause it there first.'
              : 'Test paused'}
          </strong>
          <button className="primary" disabled={timer.busy} onClick={() => void timer.resume()}>
            <Play size={16} /> Resume timer
          </button>
        </div>
      )}
      <div className="question-meta">
        <span className="eyebrow">Select one answer</span>
        <button
          className="icon-button bookmark"
          aria-label={saved(question) ? 'Remove test bookmark' : 'Bookmark test question'}
          aria-pressed={saved(question)}
          onClick={() => onBookmark(question)}
        >
          <Bookmark fill={saved(question) ? 'currentColor' : 'none'} size={21} />
        </button>
      </div>
      <MCQView
        maths={bank.kind === 'maths'}
        question={question}
        selected={draft.answers[question.id]}
        disabled={timer.paused}
        onSelect={(answer) =>
          void change((d) => ({
            ...d,
            visited: [...new Set([...(d.visited ?? []), question.id])],
            answers: { ...d.answers, [question.id]: answer },
          }))
        }
      />
      <ExamActions
        index={draft.index}
        total={test.questionIds.length}
        paused={timer.paused}
        marked={!!draft.marked?.includes(question.id)}
        hasAnswer={!!draft.answers[question.id]}
        onMove={(index) => void move(index)}
        onClear={() =>
          void change((d) => {
            const answers = { ...d.answers };
            delete answers[question.id];
            return { ...d, answers };
          })
        }
        onMark={() =>
          void change((d) => ({
            ...d,
            visited: [...new Set([...(d.visited ?? []), question.id])],
            marked: d.marked?.includes(question.id)
              ? d.marked.filter((id) => id !== question.id)
              : [...(d.marked ?? []), question.id],
          }))
        }
        onSubmit={() => {
          if (
            confirm(
              `Submit this test? ${answered} answered, ${test.questionIds.length - answered} unanswered, ${draft.marked?.length ?? 0} marked for review. Saved answers on marked questions will also be scored.`,
            )
          )
            void finish(timer.capture()!);
        }}
      />
    </div>
  );
}
export function ExamAnalysis({
  test,
  bank,
  hide,
  onHide,
  onBack,
  saved,
  onBookmark,
  initialIndex = 0,
}: {
  initialIndex?: number;
  test: Exam;
  bank: Bank;
  hide: boolean;
  onHide: (v: boolean) => void;
  onBack: () => void;
  saved: (q: MCQ) => boolean;
  onBookmark: (q: MCQ) => void;
}) {
  const [index, setIndex] = useState(initialIndex),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const q = bank.questions.find((q) => q.id === test.questionIds[index])!,
    show = !hide || revealed[q.id];
  return (
    <>
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={17} /> Result
      </button>
      <div className="review-toggle">
        <label>
          <span>
            Reattempt mode<small>Practice without changing your result</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={hide}
            onChange={(e) => {
              onHide(e.target.checked);
              setAnswers({});
              setRevealed({});
            }}
          />
        </label>
      </div>
      <div className="question-meta">
        <label>
          Question{' '}
          <select
            aria-label="Analysis question"
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          >
            {test.questionIds.map((id, i) => (
              <option key={id} value={i}>
                {i + 1}
              </option>
            ))}
          </select>{' '}
          / {test.questionIds.length}
        </label>
        <button
          className="icon-button"
          aria-label={saved(q) ? 'Remove test bookmark' : 'Bookmark test question'}
          onClick={() => onBookmark(q)}
        >
          <Bookmark size={21} fill={saved(q) ? 'currentColor' : 'none'} />
        </button>
      </div>
      <p className="question-time">
        Time spent on this question: <strong>{time(test.latest?.spent[q.id] ?? 0)}</strong>
      </p>
      <MCQView
        maths={bank.kind === 'maths'}
        question={q}
        selected={hide ? answers[q.id] : test.latest?.answers[q.id]}
        reveal={show}
        disabled={show}
        onSelect={(id) => setAnswers((a) => ({ ...a, [q.id]: id }))}
      />
      {hide && !show && (
        <button
          className="primary full"
          disabled={!answers[q.id]}
          onClick={() => setRevealed((r) => ({ ...r, [q.id]: true }))}
        >
          Save and show answer
        </button>
      )}
      <div className="question-nav">
        <button className="secondary" disabled={!index} onClick={() => setIndex((i) => i - 1)}>
          Previous
        </button>
        <button
          className="secondary"
          disabled={index === test.questionIds.length - 1}
          onClick={() => setIndex((i) => i + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}
