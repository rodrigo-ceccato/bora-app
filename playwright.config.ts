import { defineConfig, devices } from '@playwright/test';

const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (process.env.CI ? undefined : '/usr/sbin/chromium');
const chromiumLaunchOptions = chromiumExecutable ? { executablePath: chromiumExecutable } : {};

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8080',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium-smoke',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: chromiumLaunchOptions,
        viewport: { width: 1440, height: 1000 }
      }
    },
    {
      name: 'chromium-touch',
      use: {
        ...devices['Pixel 7'],
        launchOptions: chromiumLaunchOptions
      }
    },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'], viewport: { width: 1024, height: 900 } } },
    { name: 'webkit-touch', use: { ...devices['iPhone 13'] } }
  ]
});
