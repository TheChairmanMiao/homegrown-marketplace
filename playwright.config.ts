import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  timeout: 30000,
  expect: { timeout: 5000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: 'chrome',
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'America/Los_Angeles',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 30000,
  },
})
