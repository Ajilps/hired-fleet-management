import { defineConfig } from '@playwright/test'

if (!process.env.TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
  throw new Error('Live tests require DATABASE_URL and TEST_DATABASE_URL to identify the same disposable migrated database.')
}

export default defineConfig({
  testDir: './e2e-live',
  timeout: 45_000,
  globalTimeout: 5 * 60_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4175',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    {
      command: 'pnpm --dir ../backend run dev',
      url: 'http://127.0.0.1:3001/ready',
      reuseExistingServer: false,
      env: { NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '3001', AUTH_SESSION_KEY: Buffer.alloc(32, 7).toString('base64url'), COMMAND_FINGERPRINT_KEY: Buffer.alloc(32, 8).toString('base64url'), CORS_ORIGINS: 'http://127.0.0.1:4175' },
    },
    {
      command: 'pnpm run dev --host 127.0.0.1 --port 4175 --strictPort',
      url: 'http://127.0.0.1:4175',
      reuseExistingServer: false,
      env: { VITE_API_BASE_URL: 'http://127.0.0.1:3001' },
    },
  ],
})
