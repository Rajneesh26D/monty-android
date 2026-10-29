import { useEffect, useState } from 'react';
import { Download, Link, RefreshCw, Unlink } from 'lucide-react';
import { MONTY_WEB_ORIGIN, MONTY_MOBILE_ORIGIN } from '../../shared/cloud';
import {
  mobileCloud,
  mobileConnection,
  pairMobile,
  disconnectMobile,
  pairingCode,
  siteFetch,
} from '../services/cloud';
import { syncNow } from '../storage/repository';
type Device = { id: string; name: string; createdAt: number; expiresAt: number };

export function CloudSettings({ notify }: { notify: (message: string) => void }) {
  const [connected, setConnected] = useState(false),
    [code, setCode] = useState(pairingCode),
    [busy, setBusy] = useState(false);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number; connectUrl: string }>();
  const [devices, setDevices] = useState<Device[]>([]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not connect. Try again.');
    } finally {
      setBusy(false);
    }
  }
  const loadDevices = async () => {
    const response = await siteFetch('devices/list');
    if (!response.ok) throw new Error('Could not load connected devices. Please retry.');
    setDevices((await response.json()).devices);
  };
  useEffect(() => {
    let active = true;
    if (mobileCloud)
      void mobileConnection()
        .then((c) => {
          if (active) setConnected(!!c && c.expiresAt > Date.now());
        })
        .catch(() => {});
    else void loadDevices().catch(() => {});
    const update = () => setCode(pairingCode());
    window.addEventListener('monty:pairing-code', update);
    return () => {
      active = false;
      window.removeEventListener('monty:pairing-code', update);
    };
  }, []);
  return (
    <>
      <section className="panel">
        <h2>{mobileCloud ? 'Sync with your web library' : 'Your shared library'}</h2>
        <p className="muted">
          Your PDFs, notes, practice, bookmarks and results use the same private library on the web
          and connected phones.
        </p>
        {mobileCloud ? (
          connected ? (
            <>
              <p className="status ready">Connected to Monty</p>
              <button
                className="secondary full"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await syncNow();
                    notify('Sync checked. See the status in the Monty header.');
                  })
                }
              >
                <RefreshCw size={18} /> Sync now
              </button>
              <button
                className="secondary full"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await disconnectMobile();
                    setConnected(false);
                    notify('Disconnected. Your downloaded library stays on this phone.');
                  })
                }
              >
                <Unlink size={18} /> Disconnect this phone
              </button>
            </>
          ) : (
            <>
              <p>
                Open your{' '}
                <a href={MONTY_WEB_ORIGIN} target="_blank" rel="noreferrer">
                  Monty web app
                </a>
                , go to Settings → Connect Android, and create a one-time code.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    await pairMobile(code);
                    setCode('');
                    setConnected(true);
                    await syncNow();
                    notify('Connected. Your web library is syncing to this phone.');
                  });
                }}
              >
                <label className="field">
                  Connection code
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="ABCDE-12345-ABCDE-12345"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                </label>
                <button className="primary full" disabled={busy}>
                  <Link size={18} /> {busy ? 'Connecting…' : 'Connect & sync'}
                </button>
              </form>
              <p className="footnote">
                Existing data on this phone is kept and merged into your library. Keep Monty open
                during the first sync.
              </p>
            </>
          )
        ) : (
          <>
            <button
              className="secondary full"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await syncNow();
                  notify('Sync checked.');
                })
              }
            >
              <RefreshCw size={18} /> Sync now
            </button>
          </>
        )}
        <p className="footnote">
          Changes sync while online. Downloaded study material and saved progress remain available
          offline. A PDF opens on a new device after its first download.
        </p>
      </section>
      {!mobileCloud && (
        <section className="panel">
          <h2>Connect Android</h2>
          <p className="muted">
            Install Monty directly on your phone. No USB cable or laptop script is needed.
          </p>
          <a className="secondary full" href={MONTY_MOBILE_ORIGIN} target="_blank" rel="noreferrer">
            <Download size={18} /> Download Android app
          </a>
          <button
            className="primary full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const response = await siteFetch('devices/pairing', { method: 'POST' });
                const result = await response.json();
                if (!response.ok)
                  throw new Error(result.error || 'Could not create a connection code.');
                setPairing(result);
              })
            }
          >
            <Link size={18} /> {busy ? 'Please wait…' : 'Create connection code'}
          </button>
          {pairing && (
            <div>
              <p>Enter this code in Android Settings → Sync with your web library:</p>
              <p className="pairing-code">
                {pairing.code
                  .toUpperCase()
                  .match(/.{1,5}/g)
                  ?.join('-')}
              </p>
              <p className="footnote">
                Valid once, until {new Date(pairing.expiresAt).toLocaleTimeString()}. Only share it
                with your own phone.
              </p>
              <a className="secondary full" href={pairing.connectUrl}>
                Connect Monty on this phone
              </a>
            </div>
          )}
          {devices.length > 0 && (
            <>
              <h3>Connected devices</h3>
              {devices.map((device) => (
                <div className="connected-device" key={device.id}>
                  <span>
                    {device.name}
                    <small>Connected {new Date(device.createdAt).toLocaleDateString()}</small>
                  </span>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const response = await siteFetch('devices/' + device.id, {
                          method: 'DELETE',
                        });
                        if (!response.ok) throw new Error('Could not revoke this connection.');
                        await loadDevices();
                        notify('Device connection revoked. Its local copy is retained.');
                      })
                    }
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </>
          )}
        </section>
      )}
    </>
  );
}
