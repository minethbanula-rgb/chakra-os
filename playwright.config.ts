import { defineConfig, devices } from '@playwright/test';

// BASE_URL lets CI point at a Vercel preview; locally it starts `vite preview`.
const baseURL = process.env.BASE_URL ?? 'http://localhost:4173/';
const executablePath = process.env.CHROME_PATH || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { baseURL, launchOptions: { executablePath }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.BASE_URL ? undefined : { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
