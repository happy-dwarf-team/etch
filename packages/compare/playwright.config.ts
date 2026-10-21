import { defineConfig } from '@playwright/test';

// The tests drive headless Chromium themselves, through the comparison's own renderer.
export default defineConfig({
  testDir: 'test',
  testMatch: '**/*.spec.ts',
  forbidOnly: !!process.env['CI'],
  reporter: process.env['CI'] ? 'github' : 'list',
  timeout: 120_000,
});
