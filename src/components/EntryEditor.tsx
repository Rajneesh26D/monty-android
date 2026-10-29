import { useState } from 'react';
import { X } from 'lucide-react';
import type { Entry } from '../../shared/types';
export function EntryEditor({
  entry,
  onClose,
  onSave,
}: {
  entry: Entry;
  onClose: () => void;
  onSave: (entry: Entry) => void;
}) {
  const [draft, setDraft] = useState(structuredClone(entry));
  const [syn, setSyn] = useState(entry.synonyms.map((r) => r.term).join(', ')),
    [ant, setAnt] = useState(entry.antonyms.map((r) => r.term).join(', '));
  const save = () => {
    if (!draft.word.trim()) return;
    const updated = {
      ...draft,
      synonyms: syn
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .map((term) => ({
          term,
          explanation: entry.synonyms.find((r) => r.term === term)?.explanation || '',
        })),
      antonyms: ant
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .map((term) => ({
          term,
          explanation: entry.antonyms.find((r) => r.term === term)?.explanation || '',
        })),
    };
    for (const k of [
      'meaningEn',
      'meaningHi',
      'mnemonic',
      'synonyms',
      'antonyms',
      'example',
    ] as const)
      if (JSON.stringify(updated[k]) !== JSON.stringify(entry[k])) updated.origins[k] = 'edited';
    onSave(updated);
  };
  return (
    <div className="modal-backdrop">
      <section role="dialog" aria-modal="true" aria-labelledby="edit-title" className="modal">
        <div className="card-heading">
          <h2 id="edit-title">Edit word</h2>
          <button className="icon-button" aria-label="Close editor" onClick={onClose}>
            <X />
          </button>
        </div>
        {(['word', 'meaningEn', 'meaningHi', 'mnemonic', 'example'] as const).map((k) => (
          <label className="field" key={k}>
            {
              {
                word: 'Word',
                meaningEn: 'English meaning',
                meaningHi: 'Hindi meaning',
                mnemonic: 'Memory trick',
                example: 'Example',
              }[k]
            }
            <textarea
              rows={k === 'word' ? 1 : 2}
              value={draft[k]}
              onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
            />
          </label>
        ))}
        <label className="field">
          Synonyms, separated by commas
          <input value={syn} onChange={(e) => setSyn(e.target.value)} />
        </label>
        <label className="field">
          Antonyms, separated by commas
          <input value={ant} onChange={(e) => setAnt(e.target.value)} />
        </label>
        <button className="primary full" onClick={save}>
          Save word
        </button>
      </section>
    </div>
  );
}
