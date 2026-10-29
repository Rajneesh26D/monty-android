import { Check, X } from 'lucide-react';
import type { Kind, Question } from '../../shared/types';
export function Choices({
  question,
  answers,
  onChoose,
  reveal = false,
  disabled = false,
}: {
  question: Question;
  answers: Record<string, Kind>;
  onChoose: (id: string, kind: Kind) => void;
  reveal?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="options">
      {question.options.map((option, index) => {
        const selected = answers[option.id],
          correct = selected === option.kind;
        return (
          <div
            className={'option ' + (reveal ? (correct ? 'correct' : 'incorrect') : '')}
            key={option.id}
          >
            <div className="option-heading">
              <span className="option-letter">{String.fromCharCode(65 + index)}</span>
              <strong>{option.term}</strong>
              {reveal && (correct ? <Check size={18} /> : <X size={18} />)}
            </div>
            <div className="classify" role="group" aria-label={`Classify ${option.term}`}>
              {(['ant', 'syn'] as const).map((kind) => (
                <button
                  key={kind}
                  disabled={disabled}
                  aria-pressed={selected === kind}
                  onClick={() => onChoose(option.id, kind)}
                  className={selected === kind ? 'selected' : ''}
                >
                  {kind === 'ant' ? 'Antonym' : 'Synonym'}
                </button>
              ))}
            </div>
            {reveal && (
              <div className="explanation">
                <b>{option.kind === 'syn' ? 'Synonym' : 'Antonym'}.</b>{' '}
                {option.explanation ||
                  `${option.term} is listed as ${option.kind === 'syn' ? 'a similar' : 'an opposite'} term for ${question.entry.word}${question.entry.meaningEn ? ` (${question.entry.meaningEn})` : ''}.`}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
