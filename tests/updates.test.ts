import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  listeners: {} as Record<string, (event: any) => void>,
  remove: vi.fn(),
  check: vi.fn(),
  launch: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android' },
  registerPlugin: () => ({ checkForUpdate: mock.check }),
}));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: vi.fn(async (name: string, callback: (event: any) => void) => {
    mock.listeners[name] = callback; return { remove: mock.remove };
  }),
  getLaunchUrl: mock.launch,
} }));
import { initializeUpdates } from '../src/services/updates';
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-29T00:00:00Z'));
  vi.clearAllMocks(); mock.listeners = {};
  mock.check.mockResolvedValue({ available: false }); mock.launch.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());
it('checks on launch and throttles foreground checks to once an hour', async () => {
  const stop = await initializeUpdates(vi.fn());
  expect(mock.check).toHaveBeenCalledTimes(1);
  mock.listeners.appStateChange({ isActive: false });
  mock.listeners.appStateChange({ isActive: true });
  expect(mock.check).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(3600000);
  mock.listeners.appStateChange({ isActive: true });
  expect(mock.check).toHaveBeenCalledTimes(2);
  stop();
  expect(mock.remove).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(3600000);
  mock.listeners.appStateChange({ isActive: true });
  expect(mock.check).toHaveBeenCalledTimes(2);
});
it('opens update settings from both cold and warm notification launches', async () => {
  mock.launch.mockResolvedValue({ url: 'monty://settings/updates' });
  const open = vi.fn(); const stop = await initializeUpdates(open);
  expect(open).toHaveBeenCalledTimes(1);
  mock.listeners.appUrlOpen({ url: 'monty://settings/updates' });
  expect(open).toHaveBeenCalledTimes(2);
  mock.listeners.appUrlOpen({ url: 'monty://other' });
  expect(open).toHaveBeenCalledTimes(2);
  stop();
});
it('keeps the library available when an automatic check fails offline', async () => {
  mock.check.mockRejectedValue(new Error('Offline'));
  const stop = await initializeUpdates(vi.fn());
  await Promise.resolve();
  expect(mock.check).toHaveBeenCalledTimes(1);
  stop();
});
