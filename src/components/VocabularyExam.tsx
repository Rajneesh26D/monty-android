import type { Kind, QuizTest } from '../../shared/types';
import type { useAttemptClock } from './useAttemptClock';
import { Choices } from './Question';
import { ComputerExam } from './ComputerExam';
import { navigateAttempt } from '../core/computerExam';

export function VocabularyExam({
  test,
  timer,
  onUpdate,
  onExit,
  onHome,
  onSubmit,
  saved,
  onBookmark,
}: {
  test: QuizTest;
  timer: ReturnType<typeof useAttemptClock>;
  onUpdate: (change: (test: QuizTest) => QuizTest) => Promise<unknown>;
  onExit: () => void;
  onHome: () => void;
  onSubmit: () => Promise<unknown>;
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
  const navigate = (action: 'jump' | 'save-next' | 'review-next', index?: number) =>
    change((d) => navigateAttempt(d, ids, action, index));
  const choose = (id: string, kind: Kind) =>
    void change((d) => ({
      ...d,
      visited: [...new Set([...(d.visited ?? []), q.id])],
      answers: { ...d.answers, [q.id]: { ...d.answers[q.id], [id]: kind } },
    }));
  return (
    <ComputerExam
      title={test.name}
      section="Vocabulary"
      ids={ids}
      index={draft.index}
      answered={answered}
      visited={[...(draft.visited ?? []), ...Object.keys(draft.answers)]}
      marked={draft.marked}
      timer={timer}
      saved={saved}
      onBookmark={onBookmark}
      onMove={(index) => navigate('jump', index)}
      onSaveNext={() => navigate('save-next')}
      onReviewNext={() => navigate('review-next')}
      hasAnswer={Object.keys(answers).length > 0}
      onClear={() =>
        change((d) => {
          const answers = { ...d.answers };
          delete answers[q.id];
          return { ...d, answers };
        })
      }
      onExit={onExit}
      onHome={onHome}
      onSubmit={onSubmit}
    >
      <div className="quiz-head">
        <p className="cbt-word-instruction">Classify each option as a synonym or antonym of:</p>
        <h1>{q.entry.word}</h1>
      </div>
      <Choices question={q} answers={answers} onChoose={choose} disabled={timer.paused} />
    </ComputerExam>
  );
}
