import { useSyncExternalStore } from 'react';

export const themeColors = ['violet', 'red', 'pink', 'yellow', 'teal'] as const;
export type ThemeColor = (typeof themeColors)[number];
export type Appearance = { mode: 'dark' | 'light'; color: ThemeColor };
const key = 'monty-appearance-v1';
const defaultAppearance: Appearance = { mode: 'dark', color: 'violet' };
let current: Appearance = defaultAppearance;
const listeners = new Set<() => void>();
function read(): Appearance {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (value && ['dark', 'light'].includes(value.mode) && themeColors.includes(value.color))
      return value;
  } catch {
    /* Keep the default when storage is unavailable or invalid. */
  }
  return defaultAppearance;
}
function apply() {
  document.documentElement.dataset.mode = current.mode;
  document.documentElement.dataset.theme = current.color;
  document.documentElement.style.colorScheme = current.mode;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', current.mode === 'dark' ? '#0e1020' : '#eef0f7');
}
export function initializeAppearance() {
  current = read();
  apply();
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return;
    current = read();
    apply();
    listeners.forEach((listener) => listener());
  });
}
export function setAppearance(value: Appearance) {
  current = value;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Still apply for this session. */
  }
  apply();
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const useAppearance = () => useSyncExternalStore(subscribe, () => current);
