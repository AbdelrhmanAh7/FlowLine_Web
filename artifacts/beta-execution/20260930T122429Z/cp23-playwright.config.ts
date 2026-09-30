import { defineConfig } from '@playwright/test';
import path from 'node:path';
import base from '../../../playwright.config';
export default defineConfig({
  ...base,
  testDir: path.resolve(process.cwd(), 'e2e'),
  webServer: undefined,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['line'], ['json']],
  use: { ...base.use, trace: 'off', screenshot: 'off' },
});
