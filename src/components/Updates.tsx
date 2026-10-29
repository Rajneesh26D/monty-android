import { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Bell, Download, RefreshCw } from 'lucide-react';
import { updater, releasesUrl, type UpdateStatus, type UpdateResult } from '../services/updates';

export function Updates() {
  const [status, setStatus] = useState<UpdateStatus>();
  const [release, setRelease] = useState<UpdateResult>();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [licenses, setLicenses] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = () =>
      updater
        .getStatus()
        .then((value) => {
          if (active) setStatus(value);
        })
        .catch(() => {
          if (active) setError('Could not read update settings. Please reopen Settings.');
        });
    void refresh();
    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void refresh();
    });
    return () => {
      active = false;
      void listener.then((handle) => handle.remove());
    };
  }, []);
  async function action(name: string, run: () => Promise<void>) {
    setBusy(name);
    setError('');
    setMessage('');
    try {
      await run();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete this action. Try again.');
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <section className="panel" aria-labelledby="updates-heading">
        <h2 id="updates-heading">Updates</h2>
        <p className="muted">
          {status
            ? `Installed: ${status.versionName} · ${status.architecture}`
            : 'Reading app version…'}
        </p>
        <button
          className="secondary full"
          disabled={!!busy || !status}
          onClick={() =>
            void action('check', async () => {
              const next = await updater.checkForUpdate();
              setRelease(next);
              setStatus(await updater.getStatus());
              setMessage(
                next.available
                  ? next.compatible
                    ? `Monty ${next.versionName} is available.`
                    : 'This update needs a newer Android version.'
                  : 'Monty is up to date.',
              );
            })
          }
        >
          <RefreshCw size={18} /> {busy === 'check' ? 'Checking…' : 'Check for updates'}
        </button>
        {release?.available && (
          <>
            <p>{release.notes}</p>
            {release.compatible && (
              <button
                className="primary full"
                disabled={!!busy}
                onClick={() =>
                  void action('install', async () => {
                    setMessage('Downloading and verifying the APK. Keep Monty open…');
                    await updater.installLatest();
                    setMessage(
                      'Confirm the update in Android’s installer. Your study data stays on this device.',
                    );
                  })
                }
              >
                <Download size={18} />{' '}
                {busy === 'install'
                  ? 'Downloading & verifying…'
                  : `Download & install · ${(release.size / 1024 / 1024).toFixed(1)} MB`}
              </button>
            )}
          </>
        )}
        {status?.lastChecked ? (
          <p className="footnote">Last checked: {new Date(status.lastChecked).toLocaleString()}</p>
        ) : null}
        <p className="footnote">
          Android will ask you to allow updates from Monty and confirm installation.
        </p>
        <a href={releasesUrl} target="_blank" rel="noreferrer">
          Download Monty for Android
        </a>
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
      </section>
      <section className="panel" aria-labelledby="notifications-heading">
        <h2 id="notifications-heading">Notifications</h2>
        <p className="muted">Get a notification when a new Monty version is available.</p>
        <label className="update-notification-option">
          <input
            type="checkbox"
            checked={status?.notificationsEnabled ?? false}
            disabled={!!busy || !status}
            onChange={(event) => {
              const enabled = event.target.checked;
              void action('notifications', async () => {
                const result = await updater.setNotifications({ enabled });
                setStatus(await updater.getStatus());
                if (enabled && (!result.enabled || !result.allowed))
                  setMessage(
                    'Notifications are blocked. Enable them in Android notification settings.',
                  );
                else
                  setMessage(
                    result.enabled
                      ? 'Update notifications enabled.'
                      : 'Update notifications turned off.',
                  );
              });
            }}
          />
          <span>App updates</span>
        </label>
        {status && (!status.notificationsAllowed || status.notificationsEnabled) && (
          <button
            className="secondary full"
            disabled={!!busy}
            onClick={() => void action('settings', () => updater.openNotificationSettings())}
          >
            <Bell size={18} /> Android notification settings
          </button>
        )}
        <p className="footnote">
          Checks run when Monty opens and about every six hours while notifications are on. Battery
          settings can delay background checks.
        </p>
        <details
          onToggle={(event) => {
            if (event.currentTarget.open && !licenses) {
              void fetch('/third-party-notices.txt')
                .then((response) => {
                  if (!response.ok) throw new Error();
                  return response.text();
                })
                .then(setLicenses)
                .catch(() =>
                  setLicenses('License notices are included with the app source on GitHub.'),
                );
            }
          }}
        >
          <summary>Third-party licenses</summary>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12 }}>
            {licenses || 'Opening license notices…'}
          </pre>
        </details>
      </section>
    </>
  );
}
