import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // bootstrap.integration.ts boots the real AppModule through Nest's DI
  // container, which resolves constructor dependencies from TypeScript's
  // emitDecoratorMetadata output (design:paramtypes). Vitest's default
  // esbuild/oxc transform does not implement emitDecoratorMetadata at all,
  // so any provider relying on implicit constructor-type injection (no
  // explicit @Inject() token) gets undefined metadata and NestJS can't
  // resolve it — surfacing as `process.exit(1)` (abortOnError defaults to
  // true) rather than a catchable error. SWC's transform does implement it
  // correctly, matching the real `tsc` build's output.
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
    include: ["test/integration/**/*.integration.ts"],
    // Each file's beforeAll spins up its own testcontainers Postgres
    // (postgres-test-db.ts::createTestDb). Running files concurrently races
    // them for Docker resources and some containers miss the beforeAll hook
    // timeout under load. One file at a time trades speed for reliability.
    fileParallelism: false
  }
});
