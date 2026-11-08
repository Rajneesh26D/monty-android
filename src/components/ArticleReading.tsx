import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Check,
  FileText,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import type { State } from '../../shared/types';
import { uid } from '../../shared/types';
import {
  articleContentSchema,
  emptyReading,
  readerThemes,
  wordMeaningSchema,
  type ArticleBlock,
  type ReadingArticle,
  type ReaderTheme,
  type SavedWord,
  type WordMeaning,
} from '../../shared/reading';
import { articleFromHTML, articleFromText, wordContext, wordTokens } from '../core/articles';
import { readAttachment, removeAttachment, saveAttachment } from '../storage/repository';
import { siteFetch } from '../services/cloud';
import '../reading.css';
const themeNames: Record<ReaderTheme, string> = {
  midnight: 'Midnight',
  paper: 'Paper',
  slate: 'Slate',
  gold: 'Ink & Gold',
  editorial: 'Editorial',
};
function preference(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
type Lookup = {
  word: string;
  context: string;
  articleTitle: string;
  result?: WordMeaning;
  error?: string;
};
export function ArticleReading({
  state,
  commit,
  onBack,
}: {
  state: State;
  commit: (update: State | ((state: State) => State)) => Promise<unknown>;
  onBack: () => void;
}) {
  const library = state.reading ?? emptyReading();
  const [theme, setTheme] = useState<ReaderTheme>(() => {
    const value = preference('monty-reader-theme', 'midnight');
    return readerThemes.includes(value as ReaderTheme) ? (value as ReaderTheme) : 'midnight';
  });
  const [fontSize, setFontSize] = useState(() => {
    const n = Number(preference('monty-reader-font', '19'));
    return [17, 19, 21, 23].includes(n) ? n : 19;
  });
  const [tab, setTab] = useState<'articles' | 'saved'>('articles');
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ? library.articles[activeId] : undefined;
  const [blocks, setBlocks] = useState<ArticleBlock[]>([]),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState('');
  const [importing, setImporting] = useState(false),
    [format, setFormat] = useState<'text' | 'html'>('text'),
    [title, setTitle] = useState(''),
    [source, setSource] = useState('');
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [query, setQuery] = useState('');
  const [saveError, setSaveError] = useState('');
  const [lookup, setLookup] = useState<Lookup | null>(null),
    [saving, setSaving] = useState(false);
  const lookupRef = useRef<Lookup | null>(null);
  lookupRef.current = lookup;
  const sheet = useRef<HTMLDialogElement>(null),
    importDialog = useRef<HTMLDialogElement>(null),
    scroll = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null),
    sequence = useRef(0),
    progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef<{
    timer: ReturnType<typeof setTimeout>;
    x: number;
    y: number;
    fired: boolean;
  } | null>(null);
  const closeLookup = () => {
    sequence.current++;
    request.current?.abort();
    setLookup(null);
  };
  const clearHold = () => {
    if (held.current) clearTimeout(held.current.timer);
  };
  useEffect(() => {
    remember('monty-reader-theme', theme);
  }, [theme]);
  useEffect(() => {
    remember('monty-reader-font', String(fontSize));
  }, [fontSize]);
  useEffect(
    () => () => {
      request.current?.abort();
      clearHold();
      if (progressTimer.current) clearTimeout(progressTimer.current);
    },
    [],
  );
  useEffect(() => {
    const el = sheet.current;
    if (lookup && el && !el.open) el.showModal();
    if (!lookup && el?.open) el.close();
  }, [lookup]);
  useEffect(() => {
    const el = importDialog.current;
    if (importing && el && !el.open) el.showModal();
    if (!importing && el?.open) el.close();
  }, [importing]);
  useEffect(() => {
    if (!activeId) {
      setBlocks([]);
      return;
    }
    let disposed = false;
    setLoading(true);
    setLoadError('');
    setBlocks([]);
    void readAttachment(activeId)
      .then((file) => {
        const content = articleContentSchema.parse(
          JSON.parse(new TextDecoder().decode(file.bytes)),
        );
        if (disposed) return;
        setBlocks(content.blocks);
        requestAnimationFrame(() => {
          if (!disposed && scroll.current)
            scroll.current.scrollTop =
              Number(preference('monty-reader-position-' + activeId, '0')) || 0;
        });
      })
      .catch((e) => {
        if (!disposed) setLoadError(e instanceof Error ? e.message : 'Could not load article.');
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [activeId]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false,
      remove: (() => Promise<void>) | undefined;
    void NativeApp.addListener('backButton', () => {
      if (lookup) closeLookup();
      else if (importing) setImporting(false);
      else if (activeId) setActiveId(null);
      else onBack();
    }).then((listener) => {
      if (disposed) void listener.remove();
      else remove = listener.remove;
    });
    return () => {
      disposed = true;
      void remove?.();
    };
  }, [lookup, importing, activeId, onBack]);
  async function findWord(word: string, context: string, articleTitle: string) {
    clearHold();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const serial = ++sequence.current;
    setSaveError('');
    setLookup({ word, context, articleTitle });
    setMessage('');
    const timer = setTimeout(() => controller.abort(), 155000);
    try {
      const response = await siteFetch('process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'article-word', word, context }),
        signal: controller.signal,
      });
      if (!response.headers.get('content-type')?.includes('application/json'))
        throw new Error('Connect to Monty online and retry word lookup.');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Word lookup is unavailable. Please retry.');
      const result = wordMeaningSchema.parse(data);
      if (serial === sequence.current) setLookup({ word, context, articleTitle, result });
    } catch (e) {
      if (serial === sequence.current)
        setLookup({
          word,
          context,
          articleTitle,
          error: controller.signal.aborted
            ? 'Lookup timed out. Please retry.'
            : e instanceof Error
              ? e.message
              : 'Could not look up this word.',
        });
    } finally {
      clearTimeout(timer);
    }
  }
  function press(event: PointerEvent<HTMLSpanElement>, word: string, context: string) {
    clearHold();
    const next = {
      x: event.clientX,
      y: event.clientY,
      fired: false,
      timer: setTimeout(() => {
        next.fired = true;
        void findWord(word, context, active?.title || '');
      }, 480),
    };
    held.current = next;
  }
  async function saveWord() {
    if (!lookup?.result || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const result = lookup.result;
      const id = result.word.toLowerCase().replace(/’/g, "'");
      const saved: SavedWord = {
        ...result,
        id,
        context: lookup.context,
        articleTitle: lookup.articleTitle,
        savedAt: Date.now(),
      };
      await commit((s) => ({
        ...s,
        reading: {
          ...(s.reading ?? emptyReading()),
          words: { ...(s.reading?.words ?? {}), [id]: saved },
        },
      }));
    } catch {
      setSaveError('Could not save the word on this device. Please retry.');
    } finally {
      setSaving(false);
    }
  }
  async function importArticle() {
    setBusy(true);
    setMessage('');
    try {
      const parsed =
        format === 'html'
          ? articleFromHTML(source)
          : { title: '', blocks: articleFromText(source) };
      const name = (title.trim() || parsed.title || 'Untitled article').slice(0, 200);
      if (
        parsed.blocks.length > 1 &&
        parsed.blocks[0].kind === 'heading' &&
        parsed.blocks[0].text === name
      )
        parsed.blocks.shift();
      const id = uid(),
        text = parsed.blocks.map((b) => b.text).join('\n\n');
      const article: ReadingArticle = {
        id,
        title: name,
        createdAt: Date.now(),
        wordCount: wordTokens(text).filter((_, i) => i % 2 === 1).length,
        preview: text.slice(0, 200),
      };
      await saveAttachment(
        id,
        new TextEncoder().encode(JSON.stringify({ blocks: parsed.blocks })),
        'application/json',
      );
      await commit((s) => ({
        ...s,
        reading: {
          ...(s.reading ?? emptyReading()),
          articles: { ...(s.reading?.articles ?? {}), [id]: article },
        },
      }));
      setImporting(false);
      setSource('');
      setTitle('');
      setTab('articles');
      setActiveId(id);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not import the article.');
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000) {
      setMessage('Choose a text or HTML article smaller than 2 MB.');
      return;
    }
    try {
      setSource(await file.text());
      setFormat(/\.html?$/i.test(file.name) || file.type === 'text/html' ? 'html' : 'text');
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, '').slice(0, 200));
      setMessage('');
    } catch {
      setMessage('Could not read this file. Choose a text or HTML file.');
    }
  }
  async function deleteArticle(article: ReadingArticle) {
    if (!confirm(`Delete “${article.title}”? Saved words will be kept.`)) return;
    try {
      await commit((s) => {
        const articles = { ...s.reading?.articles };
        delete articles[article.id];
        return { ...s, reading: { ...(s.reading ?? emptyReading()), articles } };
      });
      await removeAttachment(article.id);
    } catch {
      setMessage('Could not finish deleting the article. Please retry.');
    }
  }
  const articles = Object.values(library.articles)
    .filter((a) => (a.title + ' ' + a.preview).toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt);
  const words = Object.values(library.words)
    .filter((w) =>
      (w.word + ' ' + w.meaningEn + ' ' + w.meaningHi).toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => b.savedAt - a.savedAt);
  const saved =
    !saveError &&
    !!(lookup?.result && library.words[lookup.result.word.toLowerCase().replace(/’/g, "'")]);
  return (
    <section className="reading-app" data-reader-theme={theme}>
      <header className="reading-header">
        <button
          className="reader-icon"
          aria-label={active ? 'Back to articles' : 'Back to Monty'}
          onClick={() => (active ? setActiveId(null) : onBack())}
        >
          <ArrowLeft size={21} />
        </button>
        <span className="reading-brand">
          Monty <span>· Reading</span>
        </span>
        <label className="reader-theme">
          <span className="sr-only">Reading theme</span>
          <select
            aria-label="Reading theme"
            value={theme}
            onChange={(e) => {
              if (readerThemes.includes(e.target.value as ReaderTheme))
                setTheme(e.target.value as ReaderTheme);
            }}
          >
            {readerThemes.map((t) => (
              <option key={t} value={t}>
                {themeNames[t]}
              </option>
            ))}
          </select>
        </label>
        <button
          className="reader-icon"
          title="Change reading text size"
          aria-label={`Text size ${fontSize}, change text size`}
          onClick={() => setFontSize((n) => (n === 23 ? 17 : n + 2))}
        >
          <Type size={20} />
        </button>
      </header>
      <div
        className="reading-scroll"
        ref={scroll}
        onScroll={() => {
          if (!activeId || !scroll.current) return;
          const top = scroll.current.scrollTop,
            id = activeId;
          if (progressTimer.current) clearTimeout(progressTimer.current);
          progressTimer.current = setTimeout(
            () => remember('monty-reader-position-' + id, String(top)),
            150,
          );
        }}
      >
        {active ? (
          <article className="reading-article" style={{ fontSize }}>
            <span className="reader-eyebrow">SSC CGL · READING</span>
            <h1>{active.title}</h1>
            {loading && <p role="status">Opening article…</p>}
            {loadError && (
              <div className="reader-error" role="alert">
                {loadError}
                <button
                  onClick={() => {
                    setActiveId(null);
                  }}
                >
                  Back to library
                </button>
              </div>
            )}
            {blocks.map((block, bi) => {
              let offset = 0;
              const text = wordTokens(block.text).map((token, ti) => {
                const start = offset;
                offset += token.length;
                if (ti % 2 === 0) return token;
                const context = wordContext(block.text, start, token.length);
                return (
                  <span
                    key={ti}
                    role="button"
                    tabIndex={0}
                    className={'reader-word' + (lookup?.word === token ? ' selected' : '')}
                    aria-label={`Look up ${token}`}
                    onPointerDown={(e) => press(e, token, context)}
                    onPointerMove={(e) => {
                      if (
                        held.current &&
                        Math.hypot(e.clientX - held.current.x, e.clientY - held.current.y) > 10
                      )
                        clearHold();
                    }}
                    onPointerUp={clearHold}
                    onPointerCancel={clearHold}
                    onPointerLeave={clearHold}
                    onClick={() => {
                      if (!held.current?.fired) void findWord(token, context, active.title);
                      held.current = null;
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (!held.current?.fired) void findWord(token, context, active.title);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        void findWord(token, context, active.title);
                      }
                    }}
                  >
                    {token}
                  </span>
                );
              });
              return block.kind === 'heading' ? (
                <h2 key={bi}>{text}</h2>
              ) : block.kind === 'quote' ? (
                <blockquote key={bi}>{text}</blockquote>
              ) : (
                <p key={bi}>{text}</p>
              );
            })}
            {!loading && !loadError && <p className="reader-end">◇</p>}
          </article>
        ) : (
          <div className="reading-library">
            <div className="reading-library-title">
              <div>
                <span className="reader-eyebrow">YOUR ENGLISH, EVERY DAY</span>
                <h1>
                  {tab === 'articles'
                    ? 'A little reading.\nA wider world.'
                    : 'Words worth keeping.'}
                </h1>
                <p>
                  {tab === 'articles'
                    ? 'Your articles. Your pace.'
                    : 'Your personal English–Hindi vocabulary.'}
                </p>
              </div>
              {tab === 'articles' && (
                <button
                  className="reader-primary reader-add"
                  onClick={() => {
                    setMessage('');
                    setImporting(true);
                  }}
                >
                  <Plus size={19} /> Add article
                </button>
              )}
            </div>
            <label className="reader-search">
              <Search size={18} />
              <input
                aria-label={tab === 'articles' ? 'Search articles' : 'Search saved words'}
                placeholder={tab === 'articles' ? 'Find an article…' : 'Find a saved word…'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {tab === 'articles' ? (
              <div className="reading-cards">
                {articles.map((a) => (
                  <div className="reading-card" key={a.id}>
                    <button className="reader-card-open" onClick={() => setActiveId(a.id)}>
                      <span className="reader-card-meta">
                        <FileText size={15} />
                        {a.wordCount.toLocaleString()} words <ArrowUpRight size={18} />
                      </span>
                      <h2>{a.title}</h2>
                      <p>{a.preview}</p>
                    </button>
                    <button
                      className="reader-icon reader-delete"
                      aria-label={`Delete article ${a.title}`}
                      onClick={() => void deleteArticle(a)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))}
                {!articles.length && (
                  <div className="reader-empty">
                    <BookOpen size={35} />
                    <h2>{query ? 'No matching articles' : 'Your next good read starts here.'}</h2>
                    <p>
                      {query
                        ? 'Try another search.'
                        : 'Paste an article or import a .txt or .html file. Tap or long-press any word while reading to explore its meaning.'}
                    </p>
                    {!query && (
                      <button
                        className="reader-primary"
                        onClick={() => {
                          setMessage('');
                          setImporting(true);
                        }}
                      >
                        <Plus size={18} />
                        Add your first article
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="reading-saved">
                {words.map((w) => (
                  <article className="saved-word-card" key={w.id}>
                    <div className="saved-word-heading">
                      <h2>
                        {w.word}
                        <small>{w.partOfSpeech}</small>
                      </h2>
                      <button
                        className="reader-icon"
                        aria-label={`Remove saved word ${w.word}`}
                        onClick={async () => {
                          if (!confirm(`Remove “${w.word}” from saved words?`)) return;
                          try {
                            await commit((s) => {
                              const words = { ...s.reading?.words };
                              delete words[w.id];
                              return { ...s, reading: { ...(s.reading ?? emptyReading()), words } };
                            });
                          } catch {
                            setMessage('Could not remove this word. Please retry.');
                          }
                        }}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                    <Meaning result={w} />
                    <details>
                      <summary>From {w.articleTitle || 'your reading'}</summary>
                      <p>{w.context}</p>
                    </details>
                  </article>
                ))}
                {!words.length && (
                  <div className="reader-empty">
                    <Bookmark size={35} />
                    <h2>{query ? 'No matching words' : 'Make new words your own.'}</h2>
                    <p>
                      {query
                        ? 'Try another search.'
                        : 'Open an article, long-press a word, then choose Save word. Its meanings, synonyms and antonyms will appear here.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {!active && (
        <nav className="reader-tabs" aria-label="Reading section">
          <button
            aria-current={tab === 'articles' ? 'page' : undefined}
            onClick={() => {
              setTab('articles');
              setQuery('');
            }}
          >
            <BookOpen size={19} />
            <span>Articles</span>
          </button>
          <button
            aria-current={tab === 'saved' ? 'page' : undefined}
            onClick={() => {
              setTab('saved');
              setQuery('');
            }}
          >
            <Bookmark size={19} />
            <span>
              Saved
              {Object.keys(library.words).length ? ` · ${Object.keys(library.words).length}` : ''}
            </span>
          </button>
        </nav>
      )}
      {message && !importing && (
        <div className="reader-toast" role="alert">
          {message}
          <button
            className="reader-icon"
            aria-label="Dismiss message"
            onClick={() => setMessage('')}
          >
            <X size={18} />
          </button>
        </div>
      )}
      <dialog
        className="reader-sheet"
        ref={sheet}
        aria-labelledby="reader-word-title"
        onCancel={(e) => {
          e.preventDefault();
          closeLookup();
        }}
        onClose={() => {
          if (lookupRef.current) closeLookup();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            const r = e.currentTarget.getBoundingClientRect();
            if (e.clientY < r.top || e.clientX < r.left || e.clientX > r.right) closeLookup();
          }
        }}
      >
        {lookup && (
          <>
            <div className="reader-sheet-handle" />
            <div className="reader-sheet-title">
              <h2 id="reader-word-title">
                {lookup.word}
                <small>{lookup.result?.partOfSpeech || 'Word lookup'}</small>
              </h2>
              <button className="reader-icon" aria-label="Close word lookup" onClick={closeLookup}>
                <X size={20} />
              </button>
            </div>
            {lookup.result ? (
              <>
                <Meaning result={lookup.result} />
                {saveError && (
                  <p className="reader-error" role="alert">
                    {saveError}
                  </p>
                )}
                <button
                  className="reader-primary reader-save"
                  disabled={saving || saved}
                  onClick={() => void saveWord()}
                >
                  {saving ? (
                    <LoaderCircle size={18} className="reader-spin" />
                  ) : saved ? (
                    <Check size={18} />
                  ) : (
                    <Bookmark size={18} />
                  )}
                  {saving ? 'Saving…' : saved ? 'Saved to your words' : 'Save word'}
                </button>
              </>
            ) : lookup.error ? (
              <div className="reader-error" role="alert">
                <p>{lookup.error}</p>
                <button
                  className="reader-primary"
                  onClick={() => void findWord(lookup.word, lookup.context, lookup.articleTitle)}
                >
                  Try again
                </button>
              </div>
            ) : (
              <div className="reader-lookup-loading" role="status">
                <LoaderCircle className="reader-spin" size={24} />
                <p>Finding meanings and related words…</p>
                <button className="reader-text-button" onClick={closeLookup}>
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
      </dialog>
      <dialog
        className="reader-import"
        ref={importDialog}
        aria-labelledby="reader-import-title"
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) setImporting(false);
        }}
        onClose={() => setImporting(false)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void importArticle();
          }}
        >
          <div className="reader-sheet-title">
            <h2 id="reader-import-title">Add an article</h2>
            <button
              type="button"
              className="reader-icon"
              aria-label="Close article import"
              disabled={busy}
              onClick={() => setImporting(false)}
            >
              <X size={20} />
            </button>
          </div>
          <label className="reader-upload">
            <Upload size={18} /> Import .txt or .html
            <input
              type="file"
              accept=".txt,.html,.htm,text/plain,text/html"
              disabled={busy}
              onChange={(e) => {
                void importFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <label>
            Title
            <input
              maxLength={200}
              value={title}
              placeholder="Give your article a title"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Format
            <select value={format} onChange={(e) => setFormat(e.target.value as 'text' | 'html')}>
              <option value="text">Plain text</option>
              <option value="html">HTML</option>
            </select>
          </label>
          <label>
            Article
            <textarea
              required
              value={source}
              maxLength={2_000_000}
              onChange={(e) => setSource(e.target.value)}
              placeholder={
                format === 'html'
                  ? 'Paste your article HTML here…'
                  : 'Paste your article text here…'
              }
            />
          </label>
          {message && (
            <p className="reader-error" role="alert">
              {message}
            </p>
          )}
          <button
            className="reader-primary reader-save"
            disabled={busy || !source.trim()}
            type="submit"
          >
            {busy ? 'Saving article…' : 'Save & read'}
            <ArrowUpRight size={18} />
          </button>
        </form>
      </dialog>
    </section>
  );
}
function Meaning({ result }: { result: WordMeaning }) {
  return (
    <div className="reader-meaning">
      <p>{result.meaningEn}</p>
      <p lang="hi">{result.meaningHi}</p>
      <dl>
        <div>
          <dt>Synonyms</dt>
          <dd>{result.synonyms.join(' · ')}</dd>
        </div>
        <div>
          <dt>Antonyms</dt>
          <dd>{result.antonyms.join(' · ')}</dd>
        </div>
      </dl>
    </div>
  );
}
