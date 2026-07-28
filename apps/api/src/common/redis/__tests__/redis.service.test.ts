import { describe, expect, it, vi } from "vitest";

// Mock spy functions
const mockRedisInstance = {
  ping: vi.fn().mockResolvedValue("PONG"),
  set: vi.fn().mockResolvedValue("OK"),
  exists: vi.fn().mockResolvedValue(1),
  get: vi.fn().mockResolvedValue("some-val"),
  getdel: vi.fn().mockResolvedValue("deleted-val"),
  del: vi.fn().mockResolvedValue(1),
  eval: vi.fn().mockResolvedValue(42),
  quit: vi.fn().mockResolvedValue("OK")
};

// Mock class for ioredis
vi.mock("ioredis", () => {
  return {
    Redis: class {
      ping = mockRedisInstance.ping;
      set = mockRedisInstance.set;
      exists = mockRedisInstance.exists;
      get = mockRedisInstance.get;
      getdel = mockRedisInstance.getdel;
      del = mockRedisInstance.del;
      eval = mockRedisInstance.eval;
      quit = mockRedisInstance.quit;
    }
  };
});

import { RedisService } from "../redis.service.js";
import { RuntimeConfigService } from "../../config/runtime-config.service.js";

class MockRuntimeConfigService implements RuntimeConfigService {
  env = {
    NODE_ENV: "test" as const,
    API_PORT: 4000,
    LOG_LEVEL: "info" as const,
    LOG_PRETTY: false,
    SERVICE_ROLE: "api" as const,
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    DATABASE_POOL_MAX: 10,
    DATABASE_CONNECTION_TIMEOUT_MS: 5_000,
    DATABASE_QUERY_TIMEOUT_MS: 10_000,
    DATABASE_STATEMENT_TIMEOUT_MS: 10_000,
    DATABASE_LOCK_TIMEOUT_MS: 5_000,
    DATABASE_IDLE_IN_TXN_TIMEOUT_MS: 30_000,
    REDIS_URL: "redis://localhost:6379",
    READINESS_TIMEOUT_MS: 2_000,
    GRACEFUL_SHUTDOWN_TIMEOUT_MS: 15_000,
    APP_TIMEZONE: "Asia/Kolkata" as const,
    TRUSTED_ORIGINS: "http://localhost:3000",
    GIT_SHA: "test-sha",
    BETTER_AUTH_SECRET: "test-secret-long-enough-32-chars-long",
    BETTER_AUTH_URL: "http://localhost:4000",
    AUTH_COOKIE_SECURE: false,
    DISABLE_SIGNUP: false,
    DISABLE_RATE_LIMITING: false
  };

  trustedOrigins(): string[] {
    return ["http://localhost:3000"];
  }
}

describe("RedisService", () => {
  it("checks ping, heartbeat, get, set, delete, and increment methods", async () => {
    const mockConfig = new MockRuntimeConfigService();
    const service = new RedisService(mockConfig);

    // Test ping
    const pingResult = await service.ping();
    expect(pingResult).toBe(true);
    expect(mockRedisInstance.ping).toHaveBeenCalled();

    // Test setWorkerHeartbeat
    await service.setWorkerHeartbeat();
    expect(mockRedisInstance.set).toHaveBeenCalledWith(
      "treasury-ops:worker:heartbeat",
      expect.any(String),
      "EX",
      60
    );

    // Test hasWorkerHeartbeat
    const hasHeartbeat = await service.hasWorkerHeartbeat();
    expect(hasHeartbeat).toBe(true);
    expect(mockRedisInstance.exists).toHaveBeenCalledWith("treasury-ops:worker:heartbeat");

    // Test get
    const getVal = await service.get("custom-key");
    expect(getVal).toBe("some-val");
    expect(mockRedisInstance.get).toHaveBeenCalledWith("custom-key");

    // Test getAndDelete
    const deletedVal = await service.getAndDelete("del-key");
    expect(deletedVal).toBe("deleted-val");
    expect(mockRedisInstance.getdel).toHaveBeenCalledWith("del-key");

    // Test set without TTL
    await service.set("key-no-ttl", "val");
    expect(mockRedisInstance.set).toHaveBeenCalledWith("key-no-ttl", "val");

    // Test set with TTL
    await service.set("key-with-ttl", "val", 120);
    expect(mockRedisInstance.set).toHaveBeenCalledWith("key-with-ttl", "val", "EX", 120);

    // Test delete
    await service.delete("delete-key");
    expect(mockRedisInstance.del).toHaveBeenCalledWith("delete-key");

    // Test increment
    const incrResult = await service.increment("incr-key", 300);
    expect(incrResult).toBe(42);
    expect(mockRedisInstance.eval).toHaveBeenCalledWith(expect.any(String), 1, "incr-key", 300);

    // Test module destroy
    await service.onModuleDestroy();
    expect(mockRedisInstance.quit).toHaveBeenCalled();
  });

  it("reports failed ping and missing worker heartbeat", async () => {
    mockRedisInstance.ping.mockResolvedValueOnce("NOPE");
    mockRedisInstance.exists.mockResolvedValueOnce(0);
    const service = new RedisService(new MockRuntimeConfigService());

    await expect(service.ping()).resolves.toBe(false);
    await expect(service.hasWorkerHeartbeat()).resolves.toBe(false);
  });

  it("reports worker heartbeat age and treats an absent heartbeat as unknown", async () => {
    const service = new RedisService(new MockRuntimeConfigService());
    mockRedisInstance.get
      .mockResolvedValueOnce("2026-07-28T00:00:00.000Z")
      .mockResolvedValueOnce(null);

    await expect(
      service.workerHeartbeatAgeSeconds(new Date("2026-07-28T00:00:30.000Z"))
    ).resolves.toBe(30);
    await expect(service.workerHeartbeatAgeSeconds()).resolves.toBeNull();
  });

  it("rejects a malformed worker heartbeat at the Redis boundary", async () => {
    const service = new RedisService(new MockRuntimeConfigService());
    mockRedisInstance.get.mockResolvedValueOnce("not-an-instant");

    await expect(service.workerHeartbeatAgeSeconds()).rejects.toThrow();
  });

  it("rejects a non-numeric increment result", async () => {
    mockRedisInstance.eval.mockResolvedValueOnce("1");
    const service = new RedisService(new MockRuntimeConfigService());

    await expect(service.increment("key", 60)).rejects.toThrow(
      "Redis increment did not return a number."
    );
  });

  it("maps blocked and unblocked rate-limit responses", async () => {
    const service = new RedisService(new MockRuntimeConfigService());
    mockRedisInstance.eval.mockResolvedValueOnce([3, 30, 1, 10]);
    await expect(service.rateLimit("key", 60_000, 2, 30_000)).resolves.toEqual({
      totalHits: 3,
      timeToExpireSeconds: 30,
      isBlocked: true,
      timeToBlockExpireSeconds: 10
    });

    mockRedisInstance.eval.mockResolvedValueOnce([1, 60, 0, 0]);
    await expect(service.rateLimit("key", 60_000, 2, 30_000)).resolves.toMatchObject({
      isBlocked: false
    });
  });

  it("rejects malformed rate-limit shapes and every non-numeric field", async () => {
    const service = new RedisService(new MockRuntimeConfigService());
    for (const result of [
      "not-an-array",
      [1, 2, 3],
      ["1", 2, 0, 0],
      [1, "2", 0, 0],
      [1, 2, "0", 0],
      [1, 2, 0, "0"]
    ]) {
      mockRedisInstance.eval.mockResolvedValueOnce(result);
      await expect(service.rateLimit("key", 60_000, 2, 30_000)).rejects.toThrow();
    }
  });
});
