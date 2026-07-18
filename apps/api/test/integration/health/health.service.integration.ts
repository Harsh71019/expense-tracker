import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { DependencyUnavailableError } from "../../../src/common/errors/dependency-unavailable.error.js";
import { HealthService } from "../../../src/health/health.service.js";
import { RedisService } from "../../../src/common/redis/redis.service.js";
import { createTestDb } from "../support/postgres-test-db.js";
import type { TestDb } from "../support/postgres-test-db.js";

describe("HealthService", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await createTestDb();
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("returns status ok when database and redis are responsive", async () => {
    // @ts-expect-error - mock RedisService for tests
    const redisMock: RedisService = {
      ping: vi.fn().mockResolvedValue(true)
    };

    const healthService = new HealthService(testDb.db, redisMock);
    const result = await healthService.readiness();

    expect(result).toEqual({
      status: "ok",
      postgres: "ok",
      redis: "ok"
    });
  });

  it("throws DependencyUnavailableError when redis ping fails", async () => {
    // @ts-expect-error - mock RedisService for tests
    const redisMock: RedisService = {
      ping: vi.fn().mockRejectedValue(new Error("Redis Down"))
    };

    const healthService = new HealthService(testDb.db, redisMock);
    await expect(healthService.readiness()).rejects.toThrow(DependencyUnavailableError);
  });

  it("throws DependencyUnavailableError when the database is unreachable", async () => {
    // @ts-expect-error - mock RedisService for tests
    const redisMock: RedisService = {
      ping: vi.fn().mockResolvedValue(true)
    };
    // @ts-expect-error - mock DrizzleDb for tests
    const brokenDb: typeof testDb.db = {
      execute: vi.fn().mockRejectedValue(new Error("Connection refused"))
    };

    const healthService = new HealthService(brokenDb, redisMock);
    await expect(healthService.readiness()).rejects.toThrow(DependencyUnavailableError);
  });
});
