import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Native replacement for vite-tsconfig-paths: resolves the "@/*" alias
    // from tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // The planner engine and time helpers are pure functions with no DOM and no
    // I/O, which is what makes them testable. Component behaviour is covered by
    // Playwright in Session 11, not here.
  },
});
