import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'pnpm e2e:stack',
    cwd: '..',
    url: 'http://localhost:3000/health',
    // 개발 스택(실제 AI 프로바이더)이 떠 있을 때 재사용하면 실비용이 나간다 — 반드시 mock e2e:stack을 새로 띄운다
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
