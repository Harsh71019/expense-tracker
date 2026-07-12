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
    MONGODB_URI: "mongodb://localhost:27017/test",
    REDIS_URL: "redis://localhost:6379",
    APP_TIMEZONE: "Asia/Kolkata" as const,
    TRUSTED_ORIGINS: "http://localhost:3000",
    GIT_SHA: "test-sha",
    BETTER_AUTH_SECRET: "test-secret-long-enough-32-chars-long",
    BETTER_AUTH_URL: "http://localhost:4000",
    AUTH_COOKIE_SECURE: false,
    DISABLE_SIGNUP: false
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
      "vyaya:worker:heartbeat",
      expect.any(String),
      "EX",
      60
    );

    // Test hasWorkerHeartbeat
    const hasHeartbeat = await service.hasWorkerHeartbeat();
    expect(hasHeartbeat).toBe(true);
    expect(mockRedisInstance.exists).toHaveBeenCalledWith("vyaya:worker:heartbeat");

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
});
