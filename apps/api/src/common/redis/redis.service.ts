import { Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";

import { RuntimeConfigService } from "../config/runtime-config.service.js";

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

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
