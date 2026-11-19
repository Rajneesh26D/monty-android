import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { ArrowLeft, ArrowRight, X, Download } from 'lucide-react';
import { readAttachment, readPdf, download } from '../storage/repository';
import { isPdf, openNativePdf, pdfName, type PdfSource } from '../services/openPdf';
import { openPdf } from '../pdf/reader';

export function usePdfViewer(notify: (message: string) => void) {
  const [source, setSource] = useState<PdfSource | null>(null);
  return {
    openPdf(source: PdfSource) {
      if (Capacitor.isNativePlatform()) void openNativePdf(source, notify);
      else setSource(source);
    },
    pdfViewer: source && (
      <FileViewer
        key={source.id}
        {...source}
        mime="application/pdf"
        onClose={() => setSource(null)}
      />
    ),
  };
}

export function FileViewer({
  id,
  name,
  mime,
  legacy,
  onClose,
}: PdfSource & {
  mime: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const declaredPdf = isPdf(name, mime);
  const [file, setFile] = useState<Uint8Array>(),
    [error, setError] = useState(''),
    [url, setUrl] = useState('');
  const pdf =
    declaredPdf || (file && new TextDecoder().decode(file.subarray(0, 1024)).includes('%PDF-'));
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let active = true,
      blobUrl = '';
    (async () => {
      const bytes = legacy ? await readPdf(id) : (await readAttachment(id)).bytes;
      if (!active) return;
      setFile(bytes);
      if (!declaredPdf && mime.startsWith('image/')) {
        blobUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
        setUrl(blobUrl);
      }
    })().catch((e) => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [id, legacy, mime, declaredPdf]);
  return (
    <dialog ref={dialog} className="viewer" aria-label={name} onClose={onClose}>
      <header>
        <button
          className="icon-button"
          aria-label="Close viewer"
          onClick={() => dialog.current?.close()}
        >
          <X />
        </button>
        <strong>{name}</strong>
        <button
          className="icon-button"
          aria-label="Download file"
          disabled={!file}
          onClick={() =>
            file && void download(file, pdf ? pdfName(name) : name, pdf ? 'application/pdf' : mime)
          }
        >
          <Download />
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {!file && !error && <p role="status">Opening file…</p>}
      {file && pdf && <PdfPages bytes={file} />}
      {file && !pdf && mime.startsWith('image/') && (
        <div className="viewer-image">
          <img src={url} alt={name} />
        </div>
      )}
      {file && !pdf && !mime.startsWith('image/') && (
        <div className="empty-state">
          <p>This file is ready to open with your phone’s viewer.</p>
          <button className="primary" onClick={() => void download(file, name, mime)}>
            Open / download
          </button>
        </div>
      )}
    </dialog>
  );
}

function PdfPages({ bytes }: { bytes: Uint8Array }) {
  const [document, setDocument] = useState<Awaited<ReturnType<typeof openPdf>>>();
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [preview, setPreview] = useState<{ page: number; url: string }>();
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    // PDF.js transfers ownership of the bytes to its worker. Keep the original for Download.
    const opening = openPdf(bytes.slice());
    void opening
      .then((pdf) => {
        if (active) setDocument(pdf);
      })
      .catch((error) => {
        if (active) setError(error instanceof Error ? error.message : 'Could not open this PDF.');
      });
    return () => {
      active = false;
      void opening.then((pdf) => pdf.close()).catch(() => {});
    };
  }, [bytes]);
  useEffect(() => {
    if (!document) return;
    let active = true;
    setError('');
    viewport.current?.scrollTo({ top: 0, left: 0 });
    void document
      .image(page)
      .then((url) => {
        if (active) setPreview({ page, url });
      })
      .catch(() => {
        if (active) setError('Could not display this PDF page.');
      });
    return () => {
      active = false;
    };
  }, [document, page]);
  return (
    <>
      {document && (
        <div className="viewer-tools" aria-label="PDF controls">
          <button
            className="icon-button"
            aria-label="Previous PDF page"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ArrowLeft size={18} />
          </button>
          <label>
            Page{' '}
            <select
              aria-label="PDF page"
              value={page}
              onChange={(e) => setPage(Number(e.target.value))}
            >
              {Array.from({ length: document.count }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>{' '}
            of {document.count}
          </label>
          <button
            className="icon-button"
            aria-label="Next PDF page"
            disabled={page >= document.count}
            onClick={() => setPage(page + 1)}
          >
            <ArrowRight size={18} />
          </button>
          <select
            aria-label="PDF zoom"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            <option value={100}>Fit width</option>
            <option value={150}>150%</option>
            <option value={200}>200%</option>
          </select>
        </div>
      )}
      <div className="viewer-pages" ref={viewport}>
        {error ? (
          <p role="alert">{error}</p>
        ) : preview?.page === page ? (
          <img alt={`PDF page ${page}`} src={preview.url} style={{ width: `${zoom}%` }} />
        ) : (
          <p role="status">Opening PDF page…</p>
        )}
      </div>
    </>
  );
}
