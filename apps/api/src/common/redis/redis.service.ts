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

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
