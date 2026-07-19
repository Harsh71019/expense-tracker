import { Injectable } from "@nestjs/common";
import type { ThrottlerStorage } from "@nestjs/throttler";

import { RedisService } from "../redis/redis.service.js";

const keyPrefix = "vyaya:throttle:";

type ThrottlerStorageRecord = Readonly<{
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}>;

/** Redis-backed ThrottlerStorage so rate-limit state survives API restarts/redeploys. */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ): Promise<ThrottlerStorageRecord> {
    const result = await this.redis.rateLimit(
      `${keyPrefix}${throttlerName}:${key}`,
      ttl,
      limit,
      blockDuration
    );

    return {
      totalHits: result.totalHits,
      timeToExpire: result.timeToExpireSeconds,
      isBlocked: result.isBlocked,
      timeToBlockExpire: result.timeToBlockExpireSeconds
    };
  }
}
