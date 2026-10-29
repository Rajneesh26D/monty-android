import type { StudyItem } from '../../shared/monty';
export function StudyContent({ item }: { item: StudyItem }) {
  return (
    <>
      <h3>Meaning / study content</h3>
      <p>{item.text}</p>
      {item.hindi && (
        <p className="hindi" lang="hi">
          {item.hindi}
        </p>
      )}
      {item.mnemonic && (
        <div className="memory">
          <h3>Memory trick</h3>
          <p>{item.mnemonic}</p>
        </div>
      )}
      {item.synonyms?.length ? (
        <div className="relation-group synonyms">
          <h3>Synonyms</h3>
          <div className="chips">
            {item.synonyms.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
        </div>
      ) : null}
      {item.antonyms?.length ? (
        <div className="relation-group antonyms">
          <h3>Antonyms</h3>
          <div className="chips">
            {item.antonyms.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
        </div>
      ) : null}
      {item.example && (
        <div className="example">
          <h3>Example</h3>
          <p>{item.example}</p>
        </div>
      )}
      <small>Source page {item.page}</small>
    </>
  );
}
