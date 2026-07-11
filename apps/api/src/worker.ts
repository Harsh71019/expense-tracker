import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { RedisService } from "./common/redis/redis.service.js";

async function bootstrapWorker(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  const redis = app.get(RedisService);

  const recordHeartbeat = async (): Promise<void> => {
    await redis.setWorkerHeartbeat();
  };

  await recordHeartbeat();
  setInterval(() => void recordHeartbeat(), 30_000).unref();
}

void bootstrapWorker();
