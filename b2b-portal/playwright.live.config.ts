import { defineConfig } from "@playwright/test";
if (
  !process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
)
  throw new Error(
    "Live portal tests require matching explicit disposable DATABASE_URL/TEST_DATABASE_URL.",
  );
const target = new URL(process.env.TEST_DATABASE_URL);
if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname))
  throw new Error("Live portal database must use loopback.");
export default defineConfig({
  testDir: "./e2e-live",
  timeout: 45000,
  globalTimeout: 180000,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4177",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  },
  projects: [
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: "node node_modules/vite/bin/vite.js --mode dev --host 127.0.0.1 --port 4178 --strictPort",
      cwd: "../admin-portal",
      url: "http://127.0.0.1:4178",
      reuseExistingServer: false,
      env: { VITE_API_BASE_URL: "http://127.0.0.1:3002" },
    },
    {
      command: "node --import tsx src/index.ts",
      cwd: "../backend",
      url: "http://127.0.0.1:3002/ready",
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        HOST: "127.0.0.1",
        PORT: "3002",
        AUTH_SESSION_KEY: Buffer.alloc(32, 11).toString("base64url"),
        COMMAND_FINGERPRINT_KEY: Buffer.alloc(32, 12).toString("base64url"),
        TRIP_CODE_ENCRYPTION_KEY: Buffer.alloc(32, 13).toString("base64url"),
        CORS_ORIGINS: "http://127.0.0.1:4177,http://127.0.0.1:4178",
        PRIVATE_UPLOADS_ENABLED: "false",
      },
    },
    {
      command:
        "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4177 --strictPort",
      url: "http://127.0.0.1:4177",
      reuseExistingServer: false,
      env: { VITE_API_BASE_URL: "http://127.0.0.1:3002" },
    },
  ],
});
