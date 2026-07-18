import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { NestFactory } from "@nestjs/core";
import type { INestApplicationContext } from "@nestjs/common";

/**
 * Boots the real AppModule through Nest's DI container — the same mechanism
 * main.ts and worker.ts use — rather than constructing services by hand
 * (`new Service(...)`), which every other integration test does and which
 * cannot catch a broken `@Injectable()` wiring. This test exists because a
 * `import type` on a constructor-parameter class (StagedRowRepository in
 * ImportsService) erased the runtime type Nest's reflection needs, and every
 * other test in this repo constructs services directly and so never
 * exercised Nest's actual resolution path — the break only surfaced when the
 * app booted for real. If a module's DI graph is broken, this is the test
 * that catches it before `pnpm dev`/deploy does.
 */
describe("AppModule bootstraps through Nest's DI container", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let app: INestApplicationContext | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    process.env.MONGODB_URI = replicaSet.getUri("vyaya_bootstrap_test");
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    process.env.REDIS_URL = "redis://127.0.0.1:6379/9";
    process.env.TRUSTED_ORIGINS = "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET = "test-secret-long-enough-32-chars-long";
    process.env.BETTER_AUTH_URL = "http://localhost:4000";

    const { AppModule } = await import("../../src/app.module.js");
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  }, 30_000);

  afterAll(async () => {
    if (app !== undefined) await app.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  it("resolves every provider the worker process depends on", async () => {
    const { ImportsService } = await import("../../src/imports/imports.service.js");
    const { ImportsQueue } = await import("../../src/imports/imports.queue.js");
    const { RedisService } = await import("../../src/common/redis/redis.service.js");

    expect(nonNullApp(app).get(ImportsService)).toBeInstanceOf(ImportsService);
    expect(nonNullApp(app).get(ImportsQueue)).toBeInstanceOf(ImportsQueue);
    expect(nonNullApp(app).get(RedisService)).toBeInstanceOf(RedisService);
  });
});

function nonNullApp(app: INestApplicationContext | undefined): INestApplicationContext {
  if (app === undefined) {
    throw new Error("Nest application context is not ready");
  }
  return app;
}
