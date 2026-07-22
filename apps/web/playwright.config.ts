import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "Desktop Chrome",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 7"] }
    }
  ],
  // Set PLAYWRIGHT_BASE_URL to run the same suite against a full compose stack
  // or a deployed preview. Otherwise, start only the web app for local smoke tests.
  ...(process.env.PLAYWRIGHT_BASE_URL === undefined
    ? {
        webServer: {
          command: "pnpm --filter @treasury-ops/web dev",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000
        }
      }
    : {})
});
