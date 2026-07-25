import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      /*
       * Drizzle's table/index callbacks and the Nest database provider are
       * declarative framework metadata, not executable application logic.
       * Migration verification and integration startup exercise them; V8
       * otherwise reports the callback factories as uncovered functions even
       * after getTableConfig() materializes every table. Keep all repositories,
       * services, controllers, workers, queues, and money paths in this gate.
       */
      exclude: [
        "src/common/db/auth-schema.ts",
        "src/common/db/db.module.ts",
        "src/common/db/schema/**"
      ],
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95
      }
    }
  }
});
