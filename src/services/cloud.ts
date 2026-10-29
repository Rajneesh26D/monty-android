import { Capacitor } from '@capacitor/core';
import { SecureStore as secure } from './secure';
import { MONTY_MOBILE_ORIGIN } from '../../shared/cloud';
export const mobileCloud = Capacitor.isNativePlatform() && import.meta.env.VITE_OFFLINE !== 'true';
export const cloudEnabled = import.meta.env.VITE_HOSTED === 'true' || mobileCloud;
let cached: Promise<{ token: string; expiresAt: number } | null> | undefined;
export function mobileConnection() {
  cached ??= secure.get({ key: 'cloud' }).then(({ value }) => {
    if (!value) return null;
    const data = JSON.parse(value);
    if (!/^[a-f0-9]{64}$/.test(data.token) || !Number.isFinite(data.expiresAt)) return null;
    return data as { token: string; expiresAt: number };
  });
  return cached;
}
export async function siteFetch(path: string, options: RequestInit = {}) {
  if (!/^[A-Za-z0-9_/?=&%.-]+$/.test(path) || path.startsWith('/') || path.includes('..'))
    throw new Error('Invalid API path.');
  const headers = new Headers(options.headers);
  if (mobileCloud) {
    const connection = await mobileConnection();
    if (!connection || connection.expiresAt <= Date.now())
      throw new Error('Connect this phone from Monty web Settings first.');
    headers.set('Authorization', 'Bearer ' + connection.token);
  }
  return fetch((mobileCloud ? MONTY_MOBILE_ORIGIN : '') + '/api/' + path, {
    ...options,
    headers,
    credentials: mobileCloud ? 'omit' : 'same-origin',
  });
}
export async function pairMobile(code: string) {
  const cleaned = code.replace(/[\s-]/g, '').toLowerCase();
  if (!/^[a-f0-9]{20}$/.test(cleaned))
    throw new Error('Enter the connection code from web Settings.');
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(MONTY_MOBILE_ORIGIN + '/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: cleaned, name: 'Android phone' }),
      signal: controller.signal,
      credentials: 'omit',
    });
    if (!response.headers.get('Content-Type')?.includes('application/json'))
      throw new Error('The mobile service is not ready yet. Please retry shortly.');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not connect this phone.');
    if (!/^[a-f0-9]{64}$/.test(result.token) || !Number.isFinite(result.expiresAt))
      throw new Error('The service returned an invalid device connection.');
    const value = { token: result.token as string, expiresAt: result.expiresAt as number };
    await secure.set({ key: 'cloud', value: JSON.stringify(value) });
    cached = Promise.resolve(value);
    window.dispatchEvent(new Event('monty:connection'));
  } finally {
    clearTimeout(timer);
  }
}
export async function disconnectMobile() {
  await secure.remove({ key: 'cloud' });
  cached = Promise.resolve(null);
  window.dispatchEvent(new Event('monty:connection'));
}
let pendingCode = '';
export const pairingCode = () => pendingCode;
export function acceptPairingLink(url: string) {
  try {
    const link = new URL(url),
      code = link.searchParams.get('code') || '';
    if (link.protocol !== 'monty:' || link.hostname !== 'pair' || !/^[a-f0-9]{20}$/.test(code))
      return false;
    pendingCode = code;
    window.dispatchEvent(new Event('monty:pairing-code'));
    return true;
  } catch {
    return false;
  }
}
