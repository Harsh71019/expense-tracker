import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "e2e/**"],
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
      // src/mocks is dev-only fixture/wiring for the local mock API layer, not app logic — excluded from the coverage gate.
      exclude: ["src/**/*.test.{ts,tsx}", "src/mocks/**"],
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90
      }
    }
  }
});
