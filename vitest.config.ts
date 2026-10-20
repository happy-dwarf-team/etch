import { defineConfig } from 'vitest/config';

// Unit tests of every package; the renderer's browser tests run in Playwright.
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
});
