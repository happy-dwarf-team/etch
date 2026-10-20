import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'test',
  testMatch: '**/*.spec.ts',
  forbidOnly: !!process.env['CI'],
  reporter: process.env['CI'] ? 'github' : 'list',
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // CI runners have no GPU; WebGL then runs on SwiftShader, which Chromium
        // only enables for WebGL when asked to.
        launchOptions: { args: ['--enable-unsafe-swiftshader'] },
      },
    },
  ],
});
