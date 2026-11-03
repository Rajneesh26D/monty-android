import { useState } from 'react';
import { splitSizes, validSplit } from '../core/quiz';

export function QuizSplitControls({
  total,
  parts,
  onChange,
}: {
  total: number;
  parts: number;
  onChange: (parts: number) => void;
}) {
  const [custom, setCustom] = useState(parts > 5);
  const valid = validSplit(total, parts);
  const sizes = valid ? splitSizes(total, parts) : [];
  return (
    <div className="quiz-split-controls">
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
      {valid && parts > 1 && (
        <p className="split-preview" role="status">
          {sizes.join(' + ')} questions · {parts} separate results
        </p>
      )}
      {!valid && total > 0 && (
        <p className="notice danger" role="alert">
          Choose between 1 and {total} quizzes, with at least one question in each.
        </p>
      )}
      <p className="muted">
        Works with one PDF, multiple PDFs, or bookmarked questions. Each quiz has its own timer and
        result.
      </p>
    </div>
  );
}
