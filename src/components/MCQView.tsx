import { useState } from 'react';
import { englishMathText, flowMathText } from '../core/mathsText';
import type { MCQ } from '../../shared/monty';
import { RichText } from './RichText';
export function MCQView({
  question,
  selected,
  onSelect,
  reveal = false,
  disabled = false,
  maths = false,
}: {
  question: MCQ;
  selected?: string;
  onSelect?: (id: string) => void;
  reveal?: boolean;
  disabled?: boolean;
  maths?: boolean;
}) {
  const [sourceText, setSourceText] = useState(
    () => localStorage.getItem('monty-maths-source') === 'true',
  );
  const display = (text: string) =>
    maths && !sourceText ? flowMathText(englishMathText(text)) : text;
  return (
    <>
      <div className={'quiz-head ' + (maths ? 'maths-content' : '')}>
        {maths && (
          <div className="segmented question-language" aria-label="Question language">
            <button
              className={!sourceText ? 'selected' : ''}
              onClick={() => {
                setSourceText(false);
                localStorage.setItem('monty-maths-source', 'false');
              }}
            >
              English
            </button>
            <button
              className={sourceText ? 'selected' : ''}
              onClick={() => {
                setSourceText(true);
                localStorage.setItem('monty-maths-source', 'true');
              }}
            >
              Source text
            </button>
          </div>
        )}
        {question.origin === 'ai' && (
          <span className="ai-label">AI-generated · source page {question.page}</span>
        )}
        {question.passage && (
          <div className="passage">
            <RichText text={display(question.passage)} />
          </div>
        )}
        <h2 className="question-stem">
          <RichText text={display(question.stem)} />
        </h2>
      </div>
      <div className="mcq-options">
        {question.options.map((option) => (
          <button
            key={option.id}
            disabled={disabled}
            className={
              'mcq-option ' +
              (selected === option.id ? 'chosen ' : '') +
              (reveal
                ? option.id === question.answerId
                  ? 'correct '
                  : selected === option.id
                    ? 'incorrect '
                    : ''
                : '')
            }
            aria-pressed={selected === option.id}
            onClick={() => onSelect?.(option.id)}
          >
            <span className="option-letter">{option.label}</span>
            <span>
              <RichText text={display(option.text)} />
              {reveal && option.id === question.answerId && <small>Correct answer</small>}
              {reveal && selected === option.id && option.id !== question.answerId && (
                <small>Your answer</small>
              )}
            </span>
          </button>
        ))}
      </div>
      {reveal && (
        <div className="answer-note">
          <strong>
            {selected
              ? selected === question.answerId
                ? 'Correct'
                : 'Incorrect'
              : 'Answer review'}
          </strong>
          {question.meaningHi && <p lang="hi">{question.meaningHi}</p>}
          {question.explanation && <p>{question.explanation}</p>}
          <small>
            {question.answerOrigin === 'ai'
              ? 'AI-generated answer, grounded in the source'
              : 'Answer supplied by the PDF'}{' '}
            · Page {question.page}
          </small>
        </div>
      )}
    </>
  );
}
