import { defineConfig } from '@playwright/test';

const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (process.env.CI ? undefined : '/usr/sbin/chromium');

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'mobile', use: { browserName: 'chromium', launchOptions: { executablePath: chromiumExecutable }, viewport: { width: 360, height: 800 } } },
    { name: 'tablet', use: { browserName: 'chromium', launchOptions: { executablePath: chromiumExecutable }, viewport: { width: 768, height: 1000 } } },
    { name: 'desktop', use: { browserName: 'chromium', launchOptions: { executablePath: chromiumExecutable }, viewport: { width: 1440, height: 1000 } } }
  ]
});
