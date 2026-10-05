import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config — see docs/testing.md §1. Full user-journey tests (signup ->
 * referral -> order -> ...) land in later phases once those flows exist;
 * Phase 1's suite only covers what's actually built: auth + route
 * protection. Requires `npx playwright install` for browser binaries
 * (not run automatically — see the Phase 1 report).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: process.env["APP_BASE_URL"] ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
