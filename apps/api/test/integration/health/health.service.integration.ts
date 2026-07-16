import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createConnection } from "mongoose";
import type { Connection } from "mongoose";

import { DependencyUnavailableError } from "../../../src/common/errors/dependency-unavailable.error.js";
import { HealthService } from "../../../src/health/health.service.js";
import { RedisService } from "../../../src/common/redis/redis.service.js";

describe("HealthService", () => {
  let replicaSet: MongoMemoryReplSet | undefined;
  let connection: Connection | undefined;

  beforeAll(async () => {
    replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connection = await createConnection(replicaSet.getUri("vyaya_health_test")).asPromise();
  });

  afterAll(async () => {
    if (connection !== undefined) await connection.close();
    if (replicaSet !== undefined) await replicaSet.stop();
  });

  it("returns status ok when database and redis are responsive", async () => {
    // @ts-expect-error - mock RedisService for tests
    const redisMock: RedisService = {
      ping: vi.fn().mockResolvedValue(true)
    };

    const healthService = new HealthService(getConnection(connection), redisMock);
    const result = await healthService.readiness();

    expect(result).toEqual({
      status: "ok",
      mongo: "ok",
      redis: "ok"
    });
  });

  it("throws DependencyUnavailableError when redis ping fails", async () => {
    // @ts-expect-error - mock RedisService for tests
    const redisMock: RedisService = {
      ping: vi.fn().mockRejectedValue(new Error("Redis Down"))
    };

    const healthService = new HealthService(getConnection(connection), redisMock);
    await expect(healthService.readiness()).rejects.toThrow(DependencyUnavailableError);
  });

  it("throws DependencyUnavailableError when mongodb connection db is undefined", async () => {
    // @ts-expect-error - mock RedisService for tests
    const redisMock: RedisService = {
      ping: vi.fn().mockResolvedValue(true)
    };

    // @ts-expect-error - mock Connection for tests
    const mockConn: Connection = {
      db: undefined
    };

    const healthService = new HealthService(mockConn, redisMock);
    await expect(healthService.readiness()).rejects.toThrow(DependencyUnavailableError);
  });
});

function getConnection(connection: Connection | undefined): Connection {
  if (connection === undefined) throw new Error("Connection is not ready");
  return connection;
}
