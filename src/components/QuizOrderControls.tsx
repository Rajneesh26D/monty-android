import type { QuizCustomization } from '../../shared/quiz-customization';

export function QuizOrderControls({
  value,
  onChange,
}: {
  value: QuizCustomization;
  onChange: (value: QuizCustomization) => void;
}) {
  return (
    <fieldset className="quiz-order-controls">
      <legend>Question and option order</legend>
      <label>
        <input
          type="checkbox"
          checked={value.shuffleQuestions}
          onChange={(event) => onChange({ ...value, shuffleQuestions: event.target.checked })}
        />
        <span>Shuffle questions</span>
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.shuffleOptions}
          onChange={(event) => onChange({ ...value, shuffleOptions: event.target.checked })}
        />
        <span>Shuffle answer options</span>
      </label>
      <p className="muted">
        Both are off by default. Questions stay in sheet order, and options keep their original
        order. Shuffling affects only the order within each quiz.
      </p>
    </fieldset>
  );
}
