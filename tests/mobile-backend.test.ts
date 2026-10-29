import { afterEach, expect, it, vi } from 'vitest';
import { createWorker } from '../server/app';
import gateway from '../mobile-gateway/worker/index.mjs';
import { memoryBucket } from './helpers/memory-bucket';
import { upgradeState } from '../shared/migrate';
import { emptyState } from '../shared/types';
import { deviceHash } from '../server/devices';
import { MONTY_MOBILE_ORIGIN as mobile, MONTY_WEB_ORIGIN as web } from '../shared/cloud';
const asEnv = (value: any) => value;
function setup() {
  const BUCKET = memoryBucket(),
    app = createWorker({});
  const env = asEnv({ BUCKET, MONTY_GATEWAY_ORIGIN: mobile });
  const relay = {
    BUCKET: memoryBucket(),
    MONTY_UPSTREAM_ORIGIN: web,
    MONTY_UPSTREAM_TOKEN: 'server-only-test-token',
    MONTY_UPLOAD_TOKEN: 'upload-only-test-token',
  };
  const upstream = vi.fn(async (input: string, options: RequestInit) => {
    expect(new Headers(options.headers).get('OAI-Sites-Authorization')).toBe(
      'Bearer ' + relay.MONTY_UPSTREAM_TOKEN,
    );
    return app.fetch(
      new Request(input, {
        ...options,
        ...(options.body ? { duplex: 'half' } : {}),
      } as RequestInit),
      env,
    );
  });
  vi.stubGlobal('fetch', upstream);
  const owner = (path: string, options?: RequestInit) =>
    app.fetch(new Request(web + path, options), env);
  const phone = (path: string, options?: RequestInit) =>
    gateway.fetch(new Request(mobile + path, options), relay);
  return { BUCKET, relay, owner, phone, upstream };
}
afterEach(() => vi.unstubAllGlobals());

it('pairs once, reads and writes the exact web library, and revokes access without deleting data', async () => {
  const { BUCKET, owner, phone } = setup();
  const initial = upgradeState(emptyState());
  initial.monty!.folders['web-folder'] = {
    id: 'web-folder',
    parentId: null,
    area: 'maths',
    name: 'From web',
    pinned: false,
    profile: 'maths',
    createdAt: 1,
  };
  await BUCKET.put('owner/library.json', JSON.stringify(initial));
  expect((await phone('/api/state')).status).toBe(401);
  expect(
    (await phone('/pair', { method: 'POST', body: JSON.stringify({ code: '0'.repeat(20) }) }))
      .status,
  ).toBe(401);
  const pairing = (await (await owner('/api/devices/pairing', { method: 'POST' })).json()) as any;
  const request = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: pairing.code
        .toUpperCase()
        .match(/.{1,5}/g)
        .join('-'),
      name: 'My phone',
    }),
  };
  const paired = await phone('/pair', request);
  expect(paired.status).toBe(200);
  const { token, deviceId } = (await paired.json()) as any;
  expect((await phone('/pair', request)).status).toBe(401);
  expect(deviceId).toBe(await deviceHash(token));
  expect(await (await BUCKET.get('owner/devices/' + deviceId))!.text()).not.toContain(token);
  const headers = { Authorization: 'Bearer ' + token };
  const snapshot = (await (await phone('/api/state', { headers })).json()) as any;
  expect(snapshot.state.monty.folders['web-folder'].name).toBe('From web');
  snapshot.state.monty.folders['web-folder'].name = 'Edited on phone';
  expect(
    (
      await phone('/api/state', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json', 'If-Match': snapshot.revision },
        body: JSON.stringify(snapshot.state),
      })
    ).status,
  ).toBe(200);
  const current = (await (await owner('/api/state')).json()) as any;
  expect(current.state.monty.folders['web-folder'].name).toBe('Edited on phone');
  expect(
    (
      await phone('/api/pdfs/mobile-pdf', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/pdf' },
        body: '%PDF-1.7 original phone PDF',
      })
    ).status,
  ).toBe(200);
  expect(await (await owner('/api/pdfs/mobile-pdf')).text()).toContain('original phone PDF');
  const list = (await (await owner('/api/devices/list')).json()) as any;
  expect(list.devices[0].name).toBe('My phone');
  expect((await phone('/api/devices/list', { headers })).status).toBe(404);
  expect(
    (await owner('/api/devices/list', { headers: { 'X-Monty-Device-Token': token } })).status,
  ).toBe(403);
  expect((await owner('/api/devices/' + deviceId, { method: 'DELETE' })).status).toBe(200);
  expect((await phone('/api/state', { headers })).status).toBe(401);
  expect(((await (await owner('/api/state')).json()) as any).state).toEqual(current.state);
});

it('rejects expired connection codes and revoked/unknown tokens and never becomes an open proxy', async () => {
  const { BUCKET, owner, phone, upstream } = setup();
  const pairing = (await (await owner('/api/devices/pairing', { method: 'POST' })).json()) as any;
  const key = 'owner/pairing/' + (await deviceHash(pairing.code));
  await BUCKET.put(key, JSON.stringify({ expiresAt: Date.now() - 1, used: false }));
  expect(
    (await phone('/pair', { method: 'POST', body: JSON.stringify({ code: pairing.code }) })).status,
  ).toBe(401);
  expect(
    (await phone('/api/state', { headers: { Authorization: 'Bearer ' + 'a'.repeat(64) } })).status,
  ).toBe(401);
  const count = upstream.mock.calls.length;
  expect(
    (
      await phone('/api/devices/pairing', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + 'a'.repeat(64) },
      })
    ).status,
  ).toBe(404);
  expect((await phone('/anything?url=https://evil.test')).status).toBe(404);
  expect((await phone('/api/state', { headers: { Origin: 'https://evil.test' } })).status).toBe(
    403,
  );
  expect(upstream.mock.calls).toHaveLength(count);
  const preflight = await phone('/api/state', {
    method: 'OPTIONS',
    headers: { Origin: 'https://localhost' },
  });
  expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost');
  expect(await (await phone('/')).text()).not.toContain('server-only-test-token');
});

it('requires release upload authorization and publishes downloads only after every asset is complete', async () => {
  const { phone, relay } = setup();
  expect(
    (await phone('/admin/publish', { method: 'POST', body: '{"version":"2.1.0"}' })).status,
  ).toBe(401);
  const headers = {
    Authorization: 'Bearer ' + relay.MONTY_UPLOAD_TOKEN,
    'Content-Type': 'application/json',
  };
  const manifest: any = {
    applicationId: 'com.monty.study',
    versionName: '2.1.0',
    versionCode: 20100,
    packages: {},
  };
  for (const abi of ['arm64-v8a', 'universal'])
    manifest.packages[abi] = {
      url: mobile + '/downloads/2.1.0/Monty-2.1.0-' + abi + '.apk',
      sha256: 'a'.repeat(64),
      size: 4,
    };
  const upload = async (name: string, body: string) =>
    phone('/admin/releases/2.1.0/' + name, {
      method: 'PUT',
      headers: { ...headers, 'Content-Length': String(new TextEncoder().encode(body).length) },
      body,
    });
  await upload('update.json', JSON.stringify(manifest));
  expect(
    (await phone('/admin/publish', { method: 'POST', headers, body: '{"version":"2.1.0"}' }))
      .status,
  ).toBe(409);
  expect((await phone('/updates/latest.json')).status).toBe(404);
  for (const abi of ['arm64-v8a', 'universal']) await upload('Monty-2.1.0-' + abi + '.apk', 'test');
  await upload('SHA256SUMS.txt', 'test checksums');
  expect(
    (await phone('/admin/publish', { method: 'POST', headers, body: '{"version":"2.1.0"}' }))
      .status,
  ).toBe(200);
  expect(((await (await phone('/updates/latest.json')).json()) as any).versionCode).toBe(20100);
  expect(await (await phone('/downloads/2.1.0/Monty-2.1.0-arm64-v8a.apk')).text()).toBe('test');
  expect((await upload('Monty-2.1.0-arm64-v8a.apk', 'changed')).status).toBe(409);
});
