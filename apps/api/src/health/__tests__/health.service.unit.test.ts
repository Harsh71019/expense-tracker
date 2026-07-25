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

    // @ts-expect-error mock db
    const service = new HealthService(mockDb, mockRedis);
    const res = await service.readiness();

    expect(res.status).toBe("ok");
    expect(res.postgres).toBe("ok");
    expect(res.redis).toBe("ok");
  });
});
