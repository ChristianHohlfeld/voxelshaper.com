import { defineConfig } from '@playwright/test';
import fs from 'node:fs';

const cachedChromium = '/home/chris/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';
const launchOptions = { args: ['--no-sandbox'] };

if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
} else if (fs.existsSync(cachedChromium)) {
  launchOptions.executablePath = cachedChromium;
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:18332',
    browserName: 'chromium',
    headless: true,
    launchOptions,
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'node tests/e2e/server.mjs',
    url: 'http://127.0.0.1:18332',
    reuseExistingServer: !process.env.CI,
    timeout: 10_000
  }
});
