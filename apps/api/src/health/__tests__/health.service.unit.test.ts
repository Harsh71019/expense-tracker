import { describe, expect, it, vi } from "vitest";

import type { RedisService } from "../../common/redis/redis.service.js";
import { HealthService } from "../health.service.js";

describe("HealthService Unit Tests", () => {
  it("readiness returns status ok when db ping and redis ping succeed", async () => {
    const mockDb = {
      execute: vi.fn(async () => undefined)
    };
    // @ts-expect-error mock redis
    const mockRedis: RedisService = {
      ping: vi.fn(async () => true)
    };

    // @ts-expect-error focused database and config test doubles
    const service = new HealthService(mockDb, mockRedis, { env: { READINESS_TIMEOUT_MS: 100 } });
    const res = await service.readiness();

    expect(res.status).toBe("ok");
    expect(res.postgres).toBe("ok");
    expect(res.redis).toBe("ok");
  });

  it("fails within the readiness budget and names the unavailable dependency", async () => {
    vi.useFakeTimers();
    const mockDb = {
      execute: vi.fn(() => new Promise<never>(() => undefined))
    };
    // @ts-expect-error focused Redis test double
    const mockRedis: RedisService = {
      ping: vi.fn(async () => true)
    };
    // @ts-expect-error focused database and config test doubles
    const service = new HealthService(mockDb, mockRedis, { env: { READINESS_TIMEOUT_MS: 100 } });
    const readiness = service.readiness();
    const assertion = expect(readiness).rejects.toThrow("PostgreSQL not ready.");

    await vi.advanceTimersByTimeAsync(100);

    await assertion;
    vi.useRealTimers();
  });

  it("treats a false Redis ping as unavailable", async () => {
    const mockDb = {
      execute: vi.fn(async () => undefined)
    };
    // @ts-expect-error focused Redis test double
    const mockRedis: RedisService = {
      ping: vi.fn(async () => false)
    };
    // @ts-expect-error focused database and config test doubles
    const service = new HealthService(mockDb, mockRedis, { env: { READINESS_TIMEOUT_MS: 100 } });

    await expect(service.readiness()).rejects.toThrow("Redis not ready.");
  });
});
