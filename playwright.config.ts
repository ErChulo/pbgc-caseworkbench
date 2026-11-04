import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end checks for the workbench, run against the production build in a
 * real Chromium instance: IndexedDB, downloads, and hash display only exist in
 * a browser.
 *
 * The build must exist before this runs (`npm run test:e2e` builds first).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    acceptDownloads: true,
    ...devices["Desktop Chrome"],
  },
  // The suite runs against the artifact and the launch command the office
  // handover documents: `node scripts/serve.mjs`, serving ./dist.
  webServer: {
    command: "node scripts/serve.mjs --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
