import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module.js";
import { RuntimeConfigService } from "./common/config/runtime-config.service.js";
import { RedisService } from "./common/redis/redis.service.js";
import { ImportsService } from "./imports/imports.service.js";
import { startImportsWorker } from "./imports/imports.processor.js";

async function bootstrapWorker(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  const redis = app.get(RedisService);

  const recordHeartbeat = async (): Promise<void> => {
    await redis.setWorkerHeartbeat();
  };

  await recordHeartbeat();
  setInterval(() => void recordHeartbeat(), 30_000).unref();

  const importsWorker = startImportsWorker(
    app.get(RuntimeConfigService),
    app.get(ImportsService),
    app.get(Logger)
  );
  app.get(Logger).log({ event: "worker.started" }, "worker process started");

  process.on("SIGTERM", () => void importsWorker.close());
  process.on("SIGINT", () => void importsWorker.close());
}

void bootstrapWorker();
