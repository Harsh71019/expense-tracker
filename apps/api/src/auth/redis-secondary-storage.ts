import type { SecondaryStorage } from "better-auth/db";

import { RedisService } from "../common/redis/redis.service.js";

const keyPrefix = "treasury-ops:auth:";

export function createRedisSecondaryStorage(redis: RedisService): SecondaryStorage {
  const namespacedKey = (key: string): string => `${keyPrefix}${key}`;

  return {
    get: (key: string): Promise<string | null> => redis.get(namespacedKey(key)),
    getAndDelete: (key: string): Promise<string | null> => redis.getAndDelete(namespacedKey(key)),
    set: (key: string, value: string, ttl?: number): Promise<void> =>
      redis.set(namespacedKey(key), value, ttl),
    delete: (key: string): Promise<void> => redis.delete(namespacedKey(key)),
    increment: (key: string, ttl: number): Promise<number> =>
      redis.increment(namespacedKey(key), ttl)
  };
}
