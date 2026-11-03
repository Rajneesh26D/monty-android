import { useState } from 'react';
import { quizSplitSizes, validQuizSplit } from '../core/quiz';

export function QuizSplitControls({
  total,
  parts,
  onChange,
  perQuiz = null,
  onPerQuizChange,
}: {
  total: number;
  parts: number;
  onChange: (parts: number) => void;
  perQuiz?: number | null;
  onPerQuizChange?: (size: number | null) => void;
}) {
  const [custom, setCustom] = useState(parts > 5);
  const valid = validQuizSplit(total, parts, perQuiz);
  const sizes = valid ? quizSplitSizes(total, parts, perQuiz) : [];
  return (
    <div className="quiz-split-controls">
      {onPerQuizChange && (
        <label className="field">
          Divide the selected questions by
          <select
            aria-label="Quiz split method"
            value={perQuiz === null ? 'quizzes' : 'questions'}
            onChange={(event) =>
              onPerQuizChange(event.target.value === 'quizzes' ? null : Math.min(15, total || 15))
            }
          >
            <option value="quizzes">Number of quizzes</option>
            <option value="questions">Questions per quiz</option>
          </select>
        </label>
      )}
      {perQuiz !== null ? (
        <label className="field">
          Questions per quiz
          <input
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={Math.max(1, total)}
            step={1}
            value={Number.isFinite(perQuiz) ? perQuiz : ''}
            onChange={(event) =>
              onPerQuizChange?.(event.target.value === '' ? NaN : Number(event.target.value))
            }
          />
        </label>
      ) : (
        <>
          <label className="field">
            Split into separate quizzes
            <select
              aria-label="Split tests"
              value={custom || parts > 5 ? 'custom' : parts}
              onChange={(event) => {
                const value = event.target.value;
                setCustom(value === 'custom');
                if (value !== 'custom') onChange(Number(value));
              }}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n} disabled={n > 1 && n > total}>
                  {n === 1 ? 'One quiz' : `${n} quizzes`}
                </option>
              ))}
              <option value="custom">Custom number of quizzes</option>
            </select>
          </label>
          {(custom || parts > 5) && (
            <label className="field">
              Number of quizzes
              <input
                type="number"
                inputMode="numeric"
                required
                min={1}
                max={Math.max(1, total)}
                step={1}
                value={Number.isFinite(parts) ? parts : ''}
                onChange={(event) =>
                  onChange(event.target.value === '' ? NaN : Number(event.target.value))
                }
              />
            </label>
          )}
        </>
      )}
      {valid && sizes.length > 1 && (
        <p className="split-preview" role="status">
          {sizes.join(' + ')} questions · {sizes.length} separate results
        </p>
      )}
      {!valid && total > 0 && (
        <p className="notice danger" role="alert">
          {perQuiz === null
            ? `Choose between 1 and ${total} quizzes, with at least one question in each.`
            : `Choose between 1 and ${total} questions per quiz.`}
        </p>
      )}
      <p className="muted">
        Works with one PDF, multiple PDFs, or bookmarked questions. Each quiz has its own timer and
        result.
      </p>
    </div>
  );
}
