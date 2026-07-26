import { describe, expect, it, vi } from "vitest";

import { RedisThrottlerStorage } from "../redis-throttler.storage.js";

describe("RedisThrottlerStorage Unit Tests", () => {
  it("increment calls redis rateLimit and returns throttler record", async () => {
    const mockRedis = {
      rateLimit: vi.fn(async () => ({
        totalHits: 1,
        timeToExpireSeconds: 60,
        isBlocked: false,
        timeToBlockExpireSeconds: 0
      }))
    };

    // @ts-expect-error mock redis service
    const storage = new RedisThrottlerStorage(mockRedis);

    const record = await storage.increment("ip_127.0.0.1", 60, 10, 0, "default");

    expect(record.totalHits).toBe(1);
    expect(record.timeToExpire).toBe(60);
    expect(record.isBlocked).toBe(false);
    expect(mockRedis.rateLimit).toHaveBeenCalled();
  });
});
