import type { Kind, QuizTest } from '../../shared/types';
import type { useAttemptClock } from './useAttemptClock';
import { Pause } from 'lucide-react';
import { time } from '../core/exams';
import { Choices } from './Question';
import { BookmarkButton } from './WordCard';
import { QuestionTracker, ExamActions } from './QuestionTracker';

export function VocabularyExam({
  test,
  timer,
  onUpdate,
  onExit,
  onSubmit,
  saved,
  onBookmark,
}: {
  test: QuizTest;
  timer: ReturnType<typeof useAttemptClock>;
  onUpdate: (change: (test: QuizTest) => QuizTest) => Promise<unknown>;
  onExit: () => void;
  onSubmit: () => void;
  saved: boolean;
  onBookmark: () => void;
}) {
  const draft = test.draft!,
    q = test.questions[draft.index],
    answers = draft.answers[q.id] ?? {};
  const ids = test.questions.map((q) => q.id);
  const answered = (id: string) =>
    test.questions.find((q) => q.id === id)!.options.every((o) => !!draft.answers[id]?.[o.id]);
  const change = (fn: (d: NonNullable<QuizTest['draft']>) => NonNullable<QuizTest['draft']>) =>
    onUpdate((t) =>
      t.draft && t.draft.id === draft.id
        ? { ...t, draft: fn({ ...t.draft, clock: timer.capture() }) }
        : t,
    );
  const move = (index: number) => {
    void change((d) => ({
      ...d,
      index,
      visited: [...new Set([...(d.visited ?? []), q.id, ids[index]])],
    }));
    document.querySelector('main')?.scrollTo({ top: 0 });
  };
  const choose = (id: string, kind: Kind) =>
    void change((d) => ({
      ...d,
      visited: [...new Set([...(d.visited ?? []), q.id])],
      answers: { ...d.answers, [q.id]: { ...d.answers[q.id], [id]: kind } },
    }));
  return (
    <div className="active-quiz exam-page">
      <div className="exam-toolbar">
        <button className="back-button" onClick={() => void timer.pause().then(onExit)}>
          <Pause size={17} /> Save & exit
        </button>
        <div className="quiz-status">
          <span className="quiz-position">
            Question {draft.index + 1} of {test.questions.length}
          </span>
          <strong className={timer.remaining < 60000 ? 'timer urgent' : 'timer'} role="timer">
            {time(timer.remaining)}
          </strong>
        </div>
      </div>
      <p className="eyebrow">{test.name}</p>
      <QuestionTracker
        ids={ids}
        index={draft.index}
        answered={answered}
        visited={[...(draft.visited ?? []), ...Object.keys(draft.answers)]}
        marked={draft.marked}
        onNavigate={move}
      />
      <div className="question-meta">
        <span className="eyebrow">Classify each option</span>
        <BookmarkButton saved={saved} onClick={onBookmark} />
      </div>
      <div className="quiz-head">
        <h1>{q.entry.word}</h1>
      </div>
      {timer.paused && (
        <div className="notice">
          <strong>{timer.busy ? 'This attempt is open in another tab.' : 'Test paused'}</strong>
          <button className="primary" disabled={timer.busy} onClick={() => void timer.resume()}>
            Resume timer
          </button>
        </div>
      )}
      <Choices question={q} answers={answers} onChoose={choose} disabled={timer.paused} />
      <ExamActions
        index={draft.index}
        total={ids.length}
        paused={timer.paused}
        marked={!!draft.marked?.includes(q.id)}
        hasAnswer={Object.keys(answers).length > 0}
        onMove={move}
        onClear={() =>
          void change((d) => {
            const answers = { ...d.answers };
            delete answers[q.id];
            return { ...d, answers };
          })
        }
        onMark={() =>
          void change((d) => ({
            ...d,
            visited: [...new Set([...(d.visited ?? []), q.id])],
            marked: d.marked?.includes(q.id)
              ? d.marked.filter((id) => id !== q.id)
              : [...(d.marked ?? []), q.id],
          }))
        }
        onSubmit={() => {
          const count = ids.filter(answered).length;
          if (
            confirm(
              `Submit this test? ${count} answered, ${ids.length - count} incomplete or unanswered, ${draft.marked?.length ?? 0} marked for review. Saved selections on marked questions will also be scored.`,
            )
          )
            onSubmit();
        }}
      />
    </div>
  );
}
