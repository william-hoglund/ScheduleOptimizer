import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a real `next dev` and the real Supabase project in
 * `.env.local`. Deliberately not run as part of `npm run verify` — these
 * create real rows (test accounts, courses, tasks) and need email
 * confirmation off, per PLAN.md §"Session 2 verification record".
 *
 * Chromium only for now: this project runs on one developer's machine, and
 * cross-browser coverage is not where the risk is (the risk is time zones,
 * RLS, and the planner — all covered by unit tests instead).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  // Turbopack in dev mode compiles each route on its first request, which can
  // take tens of seconds — not a hang, just cold-start cost (see AGENTS.md
  // "This machine"). The default 30s budget is tuned for a warm production
  // build, not this.
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
