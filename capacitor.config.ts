import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.monty.study',
  appName: 'Monty',
  webDir: 'android-dist',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
};
export default config;
