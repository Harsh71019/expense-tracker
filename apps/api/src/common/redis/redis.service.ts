import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";

import { RuntimeConfigService } from "../config/runtime-config.service.js";

export type RateLimitResult = Readonly<{
  totalHits: number;
  timeToExpireSeconds: number;
  isBlocked: boolean;
  timeToBlockExpireSeconds: number;
}>;

/**
 * Atomic sliding-window-log limiter: a sorted set of hit timestamps per key
 * (trimmed to the current window) plus a separate block flag once the limit
 * is exceeded. One EVAL round trip; member is client-supplied (not
 * Lua-generated) since Lua's random/clock access isn't safe under Redis
 * replication/AOF replay.
 */
const RATE_LIMIT_SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local now = tonumber(ARGV[1])
local ttlMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local blockDurationMs = tonumber(ARGV[4])
local member = ARGV[5]

local blockExpiresAt = tonumber(redis.call('GET', blockKey) or '0')
local isBlocked = blockExpiresAt > now

if not isBlocked then
  redis.call('ZREMRANGEBYSCORE', hitsKey, '-inf', now - ttlMs)
  redis.call('ZADD', hitsKey, now, member)
  redis.call('PEXPIRE', hitsKey, ttlMs)
end

local totalHits = redis.call('ZCARD', hitsKey)

if totalHits > limit and not isBlocked then
  isBlocked = true
  blockExpiresAt = now + blockDurationMs
  redis.call('SET', blockKey, blockExpiresAt, 'PX', blockDurationMs)
end

local timeToExpireMs = ttlMs
local oldest = redis.call('ZRANGE', hitsKey, 0, 0, 'WITHSCORES')
if oldest[2] ~= nil then
  timeToExpireMs = math.max(0, (tonumber(oldest[2]) + ttlMs) - now)
end

local timeToBlockExpireMs = 0
if isBlocked then
  timeToBlockExpireMs = math.max(0, blockExpiresAt - now)
end

return {totalHits, math.ceil(timeToExpireMs / 1000), isBlocked and 1 or 0, math.ceil(timeToBlockExpireMs / 1000)}
`;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(config: RuntimeConfigService) {
    this.client = new Redis(config.env.REDIS_URL, { maxRetriesPerRequest: 1 });
  }

  async ping(): Promise<boolean> {
    return (await this.client.ping()) === "PONG";
  }

  async setWorkerHeartbeat(): Promise<void> {
    await this.client.set("vyaya:worker:heartbeat", new Date().toISOString(), "EX", 60);
  }

  async hasWorkerHeartbeat(): Promise<boolean> {
    return (await this.client.exists("vyaya:worker:heartbeat")) === 1;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async getAndDelete(key: string): Promise<string | null> {
    return this.client.getdel(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds === undefined) {
      await this.client.set(key, value);
      return;
    }

    await this.client.set(key, value, "EX", ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const result = await this.client.eval(
      "local value = redis.call('INCR', KEYS[1]); if value == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return value;",
      1,
      key,
      ttlSeconds
    );

    if (typeof result !== "number") {
      throw new Error("Redis increment did not return a number.");
    }

    return result;
  }

  async rateLimit(
    key: string,
    ttlMs: number,
    limit: number,
    blockDurationMs: number
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const result = await this.client.eval(
      RATE_LIMIT_SCRIPT,
      2,
      `${key}:hits`,
      `${key}:blocked`,
      now,
      ttlMs,
      limit,
      blockDurationMs,
      `${now}-${randomUUID()}`
    );

    if (!Array.isArray(result) || result.length !== 4) {
      throw new Error("Redis rate limit script returned an unexpected shape.");
    }
    const [totalHits, timeToExpireSeconds, isBlockedFlag, timeToBlockExpireSeconds] = result;
    if (
      typeof totalHits !== "number" ||
      typeof timeToExpireSeconds !== "number" ||
      typeof isBlockedFlag !== "number" ||
      typeof timeToBlockExpireSeconds !== "number"
    ) {
      throw new Error("Redis rate limit script returned non-numeric fields.");
    }

    return {
      totalHits,
      timeToExpireSeconds,
      isBlocked: isBlockedFlag === 1,
      timeToBlockExpireSeconds
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
