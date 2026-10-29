const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const deviceHash = async (value: string) =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
interface Device {
  id: string;
  name: string;
  createdAt: number;
  expiresAt: number;
}

// Dispatch still authenticates the private Site. Only the server-side gateway
// holds service access; a paired phone receives a narrower, revocable token.
export async function authorizeDevice(request: Request, bucket: R2Bucket) {
  const token = request.headers.get('X-Monty-Device-Token');
  if (token === null) return true; // Browser access already passed private Sites authentication.
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const stored = await bucket.get('owner/devices/' + (await deviceHash(token)));
  if (!stored) return false;
  const device = await stored.json<Device>();
  return device.expiresAt > Date.now();
}

export async function deviceRoutes(request: Request, bucket: R2Bucket, gatewayOrigin: string) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/api/devices/') && path !== '/api/mobile/pair') return;
  if (request.headers.has('X-Monty-Device-Token'))
    return json({ error: 'Manage connected devices from the web app.' }, 403);
  if (path === '/api/devices/pairing' && request.method === 'POST') {
    if (!gatewayOrigin)
      return json({ error: 'Android connection is being set up. Please retry later.' }, 503);
    const code = random().slice(0, 20),
      expiresAt = Date.now() + 10 * 60 * 1000;
    await bucket.put(
      'owner/pairing/' + (await deviceHash(code)),
      JSON.stringify({ expiresAt, used: false }),
    );
    return json({ code, expiresAt, gatewayOrigin, connectUrl: 'monty://pair?code=' + code });
  }
  if (path === '/api/mobile/pair' && request.method === 'POST') {
    const text = await request.text();
    if (text.length > 1024) return json({ error: 'Invalid connection code.' }, 400);
    let input: { code?: string; name?: string };
    try {
      input = JSON.parse(text);
    } catch {
      return json({ error: 'Invalid connection code.' }, 400);
    }
    const code = input.code?.replace(/[\s-]/g, '').toLowerCase();
    if (!code || !/^[a-f0-9]{20}$/.test(code))
      return json({ error: 'Invalid or expired connection code.' }, 401);
    const key = 'owner/pairing/' + (await deviceHash(code)),
      record = await bucket.get(key);
    if (!record) return json({ error: 'Invalid or expired connection code.' }, 401);
    const pair = await record.json<{ used: boolean; expiresAt: number }>();
    if (pair.used || pair.expiresAt <= Date.now())
      return json(
        { error: 'This code has expired or was already used. Create another in web Settings.' },
        401,
      );
    const claimed = await bucket.put(key, JSON.stringify({ ...pair, used: true }), {
      onlyIf: { etagMatches: record.etag },
    });
    if (!claimed)
      return json({ error: 'This code was already used. Create another in web Settings.' }, 409);
    const token = random(),
      id = await deviceHash(token);
    const device: Device = {
      id,
      name: String(input.name || 'Android phone').slice(0, 80),
      createdAt: Date.now(),
      expiresAt: Date.now() + 365 * 86400000,
    };
    await bucket.put('owner/devices/' + id, JSON.stringify(device));
    return json({ token, deviceId: id, expiresAt: device.expiresAt });
  }
  if (path === '/api/devices/list' && request.method === 'GET') {
    const objects = await bucket.list({ prefix: 'owner/devices/', limit: 100 });
    const devices = await Promise.all(
      objects.objects.map(async (item) => {
        const object = await bucket.get(item.key);
        return object ? object.json<Device>() : null;
      }),
    );
    return json({ devices: devices.filter(Boolean) });
  }
  const revoke = path.match(/^\/api\/devices\/([a-f0-9]{64})$/);
  if (revoke && request.method === 'DELETE') {
    await bucket.delete('owner/devices/' + revoke[1]);
    return json({ ok: true });
  }
  return json({ error: 'Not found' }, 404);
}
