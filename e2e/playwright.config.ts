import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'pnpm build && pnpm start',
    cwd: '..',
    url: 'http://localhost:3000/health',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
