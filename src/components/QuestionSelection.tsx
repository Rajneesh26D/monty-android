import { useState } from 'react';
import { parseQuestionSelection, formatQuestionSelection } from '../../shared/question-selection';
import { siteFetch } from '../services/cloud';
export function QuestionSelection({
  total,
  value,
  onChange,
}: {
  total: number;
  value: string;
  onChange: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  let numbers: number[] = [];
  let problem = '';
  try {
    numbers = parseQuestionSelection(value, total);
  } catch (e) {
    problem = (e as Error).message;
  }
  async function interpret() {
    setBusy(true);
    setError('');
    try {
      const response = await siteFetch('process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'question-selection', text: value, total }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      const parsed = parseQuestionSelection(result.selection, total);
      onChange(formatQuestionSelection(parsed));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="question-selection">
      <label className="field">
        Choose questions
        <textarea
          rows={2}
          maxLength={2000}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="1,2,5,6 to 20"
        />
      </label>
      <p className="muted">
        {total} questions available. Use commas, ranges, or “all”. For the first 25 questions, enter
        1 to 25. Numbering follows the practice palette.
      </p>
      <div className="actions">
        <button className="text-button" onClick={() => onChange('all')}>
          Select all
        </button>
        <button
          className="text-button"
          disabled={busy || !value.trim()}
          onClick={() => void interpret()}
        >
          {busy ? 'Interpreting…' : 'Interpret with AI'}
        </button>
      </div>
      {numbers.length > 0 ? (
        <p className="selection-preview" role="status">
          <strong>{numbers.length} questions</strong> · {formatQuestionSelection(numbers)}
        </p>
      ) : (
        <p className="muted" role="status">
          {problem}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
