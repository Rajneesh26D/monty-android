import { Capacitor, registerPlugin } from '@capacitor/core';
const SystemBars = registerPlugin<{
  setAppearance(options: { background: string; light: boolean }): Promise<void>;
}>('SystemBars');
export function setSystemAppearance(background: string, light: boolean) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background);
  if (Capacitor.isNativePlatform())
    void SystemBars.setAppearance({ background, light }).catch(() => {});
}
