import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/hosted-e2e',
  timeout: 60000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5180', ...devices['Pixel 7'], trace: 'retain-on-failure' },
  webServer: {
    command: 'npx wrangler dev --config dev.wrangler.jsonc --port 5180',
    url: 'http://127.0.0.1:5180/api/health',
    reuseExistingServer: false,
    timeout: 60000,
  },
  reporter: [['list']],
});
