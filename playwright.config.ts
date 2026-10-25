import { defineConfig, devices } from '@playwright/test';

// Mobile first: the portrait phone project is the primary target. Retries are off on purpose.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // One worker on CI: two software-rendered Chromium instances ran the runner out of memory and crashed
  // the browser ("Failed to find browser context").
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173/mutation-garden/',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'mobile-portrait', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    {
      command: 'npm run build && npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173/mutation-garden/',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174/mutation-garden/tests/e2e/fixtures/outline-render.html',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 42741 --strictPort',
      url: 'http://127.0.0.1:42741/mutation-garden/tests/e2e/fixtures/plot-status.html',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
