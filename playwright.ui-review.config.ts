import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui-review',
  timeout: 90000,
  expect: { timeout: 10000 },
  workers: 2,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'phone',
      use: {
        viewport: { width: 393, height: 852 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
      },
    },
    { name: 'desktop', use: { viewport: { width: 1365, height: 900 } } },
  ],
  webServer: {
    command: 'npx vite preview --outDir android-dist --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
