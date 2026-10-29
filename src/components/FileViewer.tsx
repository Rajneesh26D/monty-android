import { useEffect, useState } from 'react';
import { X, Download } from 'lucide-react';
import { readAttachment, download } from '../storage/repository';
export function FileViewer({
  id,
  name,
  mime,
  onClose,
}: {
  id: string;
  name: string;
  mime: string;
  onClose: () => void;
}) {
  const [file, setFile] = useState<Uint8Array>(),
    [error, setError] = useState(''),
    [url, setUrl] = useState('');
  useEffect(() => {
    let active = true,
      blobUrl = '';
    (async () => {
      const bytes = (await readAttachment(id)).bytes;
      if (!active) return;
      setFile(bytes);
      blobUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
      setUrl(blobUrl);
    })().catch((e) => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [id, mime]);
  return (
    <div className="viewer" role="dialog" aria-label={name}>
      <header>
        <button className="icon-button" aria-label="Close viewer" onClick={onClose}>
          <X />
        </button>
        <strong>{name}</strong>
        <button
          className="icon-button"
          aria-label="Download file"
          disabled={!file}
          onClick={() => file && void download(file, name, mime)}
        >
          <Download />
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {!file && !error && <p>Opening file…</p>}
      {file && mime.startsWith('image/') && (
        <div className="viewer-image">
          <img src={url} alt={name} />
        </div>
      )}
      {file && !mime.startsWith('image/') && (
        <div className="empty-state">
          <p>This file is ready to open with your phone’s viewer.</p>
          <button className="primary" onClick={() => void download(file, name, mime)}>
            Open / download
          </button>
        </div>
      )}
    </div>
  );
}
