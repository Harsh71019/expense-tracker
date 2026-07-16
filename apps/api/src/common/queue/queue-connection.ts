import { Redis } from "ioredis";

/**
 * BullMQ requires its own ioredis connection with `maxRetriesPerRequest: null`
 * — using a connection with a bounded retry count (like the general-purpose
 * one in common/redis/redis.service.ts) makes BullMQ throw at runtime. Every
 * Queue/Worker in the app must be constructed with a connection from here,
 * never the shared RedisService's client.
 */
export function createQueueConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}
