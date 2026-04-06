import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 600000,
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'https://vyde.onrender.com',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'on',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
