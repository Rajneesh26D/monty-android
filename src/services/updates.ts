import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';

export const androidUpdates = Capacitor.getPlatform() === 'android';
export const releasesUrl = 'https://github.com/Rajneesh26D/monty-android/releases/latest';
export interface UpdateStatus {
  versionCode: number;
  versionName: string;
  architecture: string;
  notificationsEnabled: boolean;
  notificationsAllowed: boolean;
  lastChecked: number;
}
export interface UpdateResult {
  available: boolean;
  compatible: boolean;
  versionName: string;
  versionCode: number;
  notes: string;
  size: number;
}
interface UpdaterPlugin {
  getStatus(): Promise<UpdateStatus>;
  checkForUpdate(): Promise<UpdateResult>;
  installLatest(): Promise<void>;
  setNotifications(options: { enabled: boolean }): Promise<{ enabled: boolean; allowed: boolean }>;
  openNotificationSettings(): Promise<void>;
}
export const updater = registerPlugin<UpdaterPlugin>('MontyUpdater');

// Register before loading the library so a notification can open Settings on a cold start.
export async function initializeUpdates(openSettings: () => void): Promise<() => void> {
  if (!androidUpdates) return () => {};
  let lastAttempt = 0;
  let active = true;
  const check = () => {
    if (!active || Date.now() - lastAttempt < 60 * 60 * 1000) return;
    lastAttempt = Date.now();
    // Manual checks report errors. An offline launch must still open the study library.
    void updater.checkForUpdate().catch(() => {});
  };
  const open = (url?: string) => {
    if (active && url === 'monty://settings/updates') openSettings();
  };
  const urlListener = await App.addListener('appUrlOpen', ({ url }) => open(url));
  const stateListener = await App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) check();
  });
  try {
    open((await App.getLaunchUrl())?.url);
  } catch {
    /* A normal launch has no URL. */
  }
  check();
  return () => {
    active = false;
    void urlListener.remove();
    void stateListener.remove();
  };
}
