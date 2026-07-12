import { describe, expect, it, vi } from "vitest";

import { createRedisSecondaryStorage } from "../redis-secondary-storage.js";
import { RedisService } from "../../common/redis/redis.service.js";

describe("createRedisSecondaryStorage", () => {
  it("wraps RedisService calls and prepends keys with 'vyaya:auth:'", async () => {
    // @ts-expect-error - mock RedisService for unit tests without as type assertion
    const mockRedis: RedisService = {
      get: vi.fn().mockResolvedValue("value-1"),
      getAndDelete: vi.fn().mockResolvedValue("value-deleted"),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      increment: vi.fn().mockResolvedValue(42)
    };

    const storage = createRedisSecondaryStorage(mockRedis);

    // Test get
    const getValue = await storage.get("key1");
    expect(getValue).toBe("value-1");
    expect(mockRedis.get).toHaveBeenCalledWith("vyaya:auth:key1");

    // Test getAndDelete
    if (storage.getAndDelete !== undefined) {
      const deletedValue = await storage.getAndDelete("key2");
      expect(deletedValue).toBe("value-deleted");
      expect(mockRedis.getAndDelete).toHaveBeenCalledWith("vyaya:auth:key2");
    } else {
      expect.fail("storage.getAndDelete is undefined");
    }

    // Test set without TTL
    await storage.set("key3", "val3");
    expect(mockRedis.set).toHaveBeenCalledWith("vyaya:auth:key3", "val3", undefined);

    // Test set with TTL
    await storage.set("key4", "val4", 120);
    expect(mockRedis.set).toHaveBeenCalledWith("vyaya:auth:key4", "val4", 120);

    // Test delete
    await storage.delete("key5");
    expect(mockRedis.delete).toHaveBeenCalledWith("vyaya:auth:key5");

    // Test increment
    if (storage.increment !== undefined) {
      const incrValue = await storage.increment("key6", 300);
      expect(incrValue).toBe(42);
      expect(mockRedis.increment).toHaveBeenCalledWith("vyaya:auth:key6", 300);
    } else {
      expect.fail("storage.increment is undefined");
    }
  });
});
