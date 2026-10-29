import { useState } from 'react';
import type { Bank, MCQ } from '../../shared/monty';
import { bankSchema } from '../../shared/monty';
import { uid } from '../../shared/types';
export function BankEditor({
  bank,
  onSave,
  onClose,
}: {
  bank: Bank;
  onSave: (b: Bank) => Promise<void>;
  onClose: () => void;
}) {
  const [questions, setQuestions] = useState<MCQ[]>(structuredClone(bank.questions)),
    [index, setIndex] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const q = questions[index];
  const edit = (patch: Partial<MCQ>) =>
    setQuestions((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const add = () => {
    setQuestions((items) => [
      ...items,
      {
        id: uid(),
        number: Math.max(0, ...items.map((x) => x.number)) + 1,
        stem: '',
        meaningHi: '',
        passage: '',
        options: ['A', 'B', 'C', 'D'].map((id) => ({ id, label: id, text: '' })),
        answerId: 'A',
        page: 1,
        pages: [1],
        origin: 'pdf',
        answerOrigin: 'pdf',
        evidence: 'Manually checked against the source PDF',
        explanation: '',
      },
    ]);
    setIndex(questions.length);
  };
  return (
    <div className="modal-backdrop">
      <section className="editor-modal" role="dialog" aria-label="Review questions">
        <div className="card-heading">
          <h2>Review questions</h2>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
        {bank.warnings.map((w, i) => (
          <p className="notice" key={i}>
            {w}
          </p>
        ))}
        <p className="muted">
          Check the original PDF before accepting. Existing completed tests keep their original
          question bank.
        </p>
        <div className="actions">
          <select
            aria-label="Edit question"
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          >
            {questions.map((x, i) => (
              <option key={x.id} value={i}>
                Question {x.number}
              </option>
            ))}
          </select>
          <button className="secondary" onClick={add}>
            Add question
          </button>
        </div>
        {q && (
          <>
            <label className="field">
              Question number
              <input
                type="number"
                min={1}
                value={q.number}
                onChange={(e) => edit({ number: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              Question
              <textarea rows={5} value={q.stem} onChange={(e) => edit({ stem: e.target.value })} />
            </label>
            <label className="field">
              Passage (if any)
              <textarea
                rows={3}
                value={q.passage}
                onChange={(e) => edit({ passage: e.target.value })}
              />
            </label>
            {q.options.map((o, i) => (
              <label className="field" key={o.id}>
                Option {o.label}
                <textarea
                  value={o.text}
                  onChange={(e) =>
                    edit({
                      options: q.options.map((x, n) =>
                        n === i ? { ...x, text: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <label className="field">
              Correct answer
              <select value={q.answerId} onChange={(e) => edit({ answerId: e.target.value })}>
                {q.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Source page
              <input
                type="number"
                min={1}
                value={q.page}
                onChange={(e) => edit({ page: Number(e.target.value) })}
              />
            </label>
            <button
              className="text-button danger"
              onClick={() => {
                if (
                  confirm(
                    'Remove this question from the new bank? Existing test snapshots stay unchanged.',
                  )
                ) {
                  setQuestions((items) => items.filter((_, i) => i !== index));
                  setIndex(0);
                }
              }}
            >
              Remove question
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <button
          className="primary full"
          disabled={busy || !questions.length}
          onClick={() => {
            setBusy(true);
            void (async () => {
              try {
                const next = bankSchema.parse({
                  ...bank,
                  id: 'bank-' + uid(),
                  questions: questions.map((q) => ({ ...q, stem: q.stem.trim() })),
                  warnings: [],
                });
                if (new Set(next.questions.map((q) => q.number)).size !== next.questions.length)
                  throw new Error('Question numbers must be unique.');
                await onSave(next);
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Check the question fields.');
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          Accept reviewed questions
        </button>
      </section>
    </div>
  );
}
