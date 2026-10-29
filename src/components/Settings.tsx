import { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Download, Upload, Link, Unlink } from 'lucide-react';
import type { State } from '../../shared/types';
import { connectBackend } from '../services/api';
import { clearToken, getToken } from '../storage/repository';
import { exportBackup, importBackup } from '../storage/backup';
import { exportOffline } from '../storage/offline';
import { androidUpdates } from '../services/updates';
import { Updates } from './Updates';
export function Settings({
  state,
  onUpdate,
  onBack,
  notify,
}: {
  state: State;
  onUpdate: (state: State) => Promise<unknown>;
  onBack: () => void;
  notify: (message: string) => void;
}) {
  const [url, setUrl] = useState(state.settings.backendUrl),
    [code, setCode] = useState(''),
    [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    getToken().then((t) => setConnected(!!t && !!state.settings.backendUrl));
  }, [state.settings.backendUrl]);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not complete this action.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={18} /> Back
      </button>
      <h1>Settings</h1>
      {androidUpdates && <Updates />}
      <section className="panel">
        <h2>Backup & restore</h2>
        <p className="muted">Save a copy of your PDFs, bookmarks, and results.</p>
        <button
          className="secondary full"
          disabled={busy}
          onClick={() => action(() => exportBackup(state))}
        >
          <Download size={18} /> Export backup
        </button>
        <button className="secondary full" disabled={busy} onClick={() => input.current?.click()}>
          <Upload size={18} /> Restore backup
        </button>
        <input
          ref={input}
          hidden
          type="file"
          accept=".zip,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (
              file &&
              confirm(
                'Replace this device’s library and results with this backup? Export a backup first if you want to keep them.',
              )
            )
              void action(async () => {
                const restored = await importBackup(file);
                await clearToken();
                await onUpdate(restored);
                setConnected(false);
                setUrl('');
                notify('Backup restored.');
              });
          }}
        />
      </section>
      {import.meta.env.VITE_HOSTED === 'true' && (
        <section className="panel">
          <h2>Keep an offline copy</h2>
          <p className="muted">
            Download Monty with your current library, PDFs, practice progress and quizzes. The
            downloaded copy runs in a browser without a ChatGPT subscription or hosting.
          </p>
          <button
            className="secondary full"
            disabled={busy}
            onClick={() => action(() => exportOffline(state))}
          >
            <Download size={18} /> Download offline Monty
          </button>
          <p className="footnote">
            Open the HTML file in a browser that allows local webpages and storage. On phones, your
            file manager may open an HTML viewer; use a browser instead. Offline changes stay in
            that browser. Export backups to keep them. AI imports and online sync need the online
            app.
          </p>
        </section>
      )}
      {import.meta.env.VITE_HOSTED === 'true' ? (
        <section className="panel">
          <h2>Online backup</h2>
          <p className="muted">
            Your library, PDFs, bookmarks and latest results are backed up to your private account.
            AI is connected automatically.
          </p>
        </section>
      ) : import.meta.env.VITE_OFFLINE === 'true' ? (
        <section className="panel">
          <h2>Offline library</h2>
          <p className="muted">
            This copy runs entirely on your device. Practice, quizzes, saved PDFs and results work
            without ChatGPT. It does not sync with the online app. Keep this file and export a
            backup after studying.
          </p>
        </section>
      ) : (
        <section className="panel">
          <h2>
            AI connection{' '}
            <span className={'status ' + (connected ? 'ready' : '')}>
              {connected ? 'Connected' : 'Not connected'}
            </span>
          </h2>
          <p className="muted">
            Connect once to your free backend. Your OpenRouter key stays on the backend.
          </p>
          {connected ? (
            <>
              <p className="connection-url">{state.settings.backendUrl}</p>
              <button
                className="secondary full"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await clearToken();
                    await onUpdate({ ...state, settings: { ...state.settings, backendUrl: '' } });
                    setConnected(false);
                  })
                }
              >
                <Unlink size={18} /> Disconnect device
              </button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  const backendUrl = await connectBackend(url, code);
                  await onUpdate({ ...state, settings: { ...state.settings, backendUrl } });
                  setCode('');
                  setConnected(true);
                  notify('Device connected. Retry missing information from Library.');
                });
              }}
            >
              <label className="field">
                Backend address
                <input
                  type="url"
                  required
                  placeholder="https://vocabmaster-api.…workers.dev"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </label>
              <label className="field">
                One-time connection code
                <input
                  required
                  type="password"
                  autoComplete="off"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Paste your connection code"
                />
              </label>
              <button className="primary full" disabled={busy}>
                <Link size={17} /> {busy ? 'Connecting…' : 'Connect device'}
              </button>
            </form>
          )}
        </section>
      )}
      <p className="footnote">
        {import.meta.env.VITE_OFFLINE === 'true'
          ? 'Your browser stores your progress. Clearing its data removes those local changes; your downloaded snapshot stays in the HTML file.'
          : import.meta.env.VITE_HOSTED === 'true'
            ? 'Free AI has daily limits. Imports resume from the last saved word.'
            : 'Learning and quizzes stay on this device. Free AI has daily limits. See the included setup guide to deploy your backend.'}
      </p>
    </div>
  );
}
