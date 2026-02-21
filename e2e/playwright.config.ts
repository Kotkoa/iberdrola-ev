import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const baseURL = isCI ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  outputDir: './test-results',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: isCI ? 'yarn preview --host 127.0.0.1 --port 4173' : 'yarn dev',
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
