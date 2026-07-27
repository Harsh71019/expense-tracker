import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true }
      },
      module: { type: "es6" }
    })
  ],
  test: {
    include: ["test/e2e/**/*.e2e.ts"],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000
  }
});
