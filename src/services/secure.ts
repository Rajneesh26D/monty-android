import { registerPlugin } from '@capacitor/core';
interface SecurePlugin {
  get(options?: { key?: string }): Promise<{ value: string | null }>;
  set(options: { key?: string; value: string }): Promise<void>;
  remove(options?: { key?: string }): Promise<void>;
}
export const SecureStore = registerPlugin<SecurePlugin>('SecureStore');
