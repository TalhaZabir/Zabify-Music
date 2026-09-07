import { defineConfig } from '@playwright/test';

// Critical user journey: search → play → queue → library.
// Requires dev servers running (npm run dev) plus `npx playwright install`.
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  use: { baseURL: 'http://127.0.0.1:5174' },
});
