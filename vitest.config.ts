import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest runs the PURE logic (unit) + mocked-Supabase (integration) tests.
// Playwright owns the browser e2e tests (tests/e2e) — excluded here.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["src/lib/**"],
    },
  },
});
