import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

/**
 * End-to-end checks against the production build served by `vite preview`,
 * so the real bundle (lazy chunks included) is what gets exercised.
 * `npm run test:e2e` builds first; CI builds in its own step.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The PWA service worker would carry cached state between tests.
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
