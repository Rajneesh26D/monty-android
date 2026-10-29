import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Answers, Kind, QuizTest, State, Entry } from '../../shared/types';
import { time } from '../core/exams';
import { Choices } from './Question';
import { BookmarkButton } from './WordCard';
export function Analysis({
  test,
  state,
  onBack,
  onHide,
  onBookmark,
}: {
  test: QuizTest;
  state: State;
  onBack: () => void;
  onHide: (hide: boolean) => void;
  onBookmark: (entry: Entry) => void;
}) {
  const [index, setIndex] = useState(0),
    [practice, setPractice] = useState<Answers>({}),
    [revealed, setRevealed] = useState<Set<string>>(new Set());
  useEffect(() => {
    setIndex(0);
    setPractice({});
    setRevealed(new Set());
  }, [test.id, test.latest?.completedAt]);
  const hide = state.settings.hideReviewAnswers,
    q = test.questions[index],
    show = !hide || revealed.has(q.id),
    answers = hide ? practice[q.id] || {} : test.latest?.answers[q.id] || {};
  const selected = q.options.every((o) => answers[o.id]);
  function choose(id: string, kind: Kind) {
    setPractice((p) => ({ ...p, [q.id]: { ...p[q.id], [id]: kind } }));
  }
  return (
    <div className="analysis">
      <div className="page-heading">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={18} /> Results
        </button>
        <span className="eyebrow">Analysis</span>
      </div>
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
              setRevealed(new Set());
              setPractice({});
              onHide(e.target.checked);
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
            {test.questions.map((_, i) => (
              <option key={i} value={i}>
                {i + 1} / {test.questions.length}
              </option>
            ))}
          </select>
        </label>
        <BookmarkButton
          saved={state.bookmarks.includes(q.entry.id)}
          onClick={() => onBookmark(q.entry)}
        />
      </div>
      <p className="question-time">
        Time on this question:{' '}
        <strong>{test.latest?.spent ? time(test.latest.spent[q.id] ?? 0) : 'Not recorded'}</strong>
      </p>
      <div className="quiz-head">
        <span className="eyebrow">{show ? 'Answer review' : 'Classify each option'}</span>
        <h1>{q.entry.word}</h1>
        {show && (
          <>
            <p>{q.entry.meaningEn}</p>
            <p lang="hi">{q.entry.meaningHi}</p>
          </>
        )}
      </div>
      <Choices
        question={q}
        answers={answers}
        onChoose={choose}
        reveal={show}
        disabled={!hide || show}
      />
      {hide && !show && (
        <button
          className="primary full"
          disabled={!selected}
          onClick={() => setRevealed((s) => new Set(s).add(q.id))}
        >
          Save and show answers
        </button>
      )}
      <div className="question-nav">
        <button className="secondary" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
          <ArrowLeft size={17} /> Previous
        </button>
        <button
          className="secondary"
          disabled={index === test.questions.length - 1}
          onClick={() => setIndex((i) => i + 1)}
        >
          Next <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}
