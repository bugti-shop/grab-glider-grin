import { defineConfig, devices } from "@playwright/test";

/**
 * Standalone Playwright config for the 5,000-task perf suite.
 * Kept separate from `playwright.config.ts` so the perf suite can run
 * in CI with strict thresholds without touching the default e2e config.
 *
 * Run: `bun run test:perf` (or `npx playwright test --config=playwright.perf.config.ts`)
 *
 * Thresholds (env-overridable in CI):
 *   PERF_MAX_RENDER_MS        default 2500   - time to first row mount @ 5k tasks
 *   PERF_MAX_DOM_ROWS         default 60     - virtualization invariant
 *   PERF_MAX_REORDER_LATENCY  default 250    - touch drag-drop latency (ms)
 *   PERF_MAX_HEAP_GROWTH_MB   default 25     - heap growth after 200 drag+complete cycles
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.perf\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.PERF_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "android-pixel-7",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "android-compact",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 360, height: 780 },
      },
    },
    {
      name: "iphone-15",
      use: { ...devices["iPhone 15"] },
    },
    {
      name: "iphone-se",
      use: { ...devices["iPhone SE"] },
    },
  ],
  webServer: process.env.PERF_SKIP_WEBSERVER
    ? undefined
    : {
        command: "bun run dev",
        url: "http://localhost:8080",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
