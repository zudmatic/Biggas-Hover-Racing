import { defineConfig } from '@playwright/test';
const port=process.env.TEST_PORT??'5173';
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium', viewport: { width: 1440, height: 1050 } },
  webServer: { command: `npm run dev -- --port ${port} --strictPort`, url: `http://127.0.0.1:${port}`, reuseExistingServer: !process.env.CI },
});
