import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module.js";
import { BillReconciliationService } from "./bills/bill-reconciliation.service.js";
import { startBillStatementsWorker } from "./bills/bill-statements.processor.js";
import { RuntimeConfigService } from "./common/config/runtime-config.service.js";
import { LogEvent } from "./common/logging/events.js";
import { RedisService } from "./common/redis/redis.service.js";
import { ImportsService } from "./imports/imports.service.js";
import { startImportsWorker } from "./imports/imports.processor.js";
import { NotificationDeliveryService } from "./notifications/notification-delivery.service.js";
import { startNotificationsWorker } from "./notifications/notifications.processor.js";
import { SpendingWarningsService } from "./spending-warnings/spending-warnings.service.js";
import { startSpendingWarningsWorker } from "./spending-warnings/spending-warnings.processor.js";

async function bootstrapWorker(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const redis = app.get(RedisService);
  const logger = app.get(Logger);

  const recordHeartbeat = async (): Promise<void> => {
    await redis.setWorkerHeartbeat();
  };

  await recordHeartbeat();
  const heartbeatTimer = setInterval(() => {
    void recordHeartbeat().catch((error: unknown) => {
      logger.error(
        { event: LogEvent.WorkerHeartbeatFailed, err: error },
        "worker heartbeat update failed"
      );
    });
  }, 30_000);
  heartbeatTimer.unref();

  const importsWorker = startImportsWorker(
    app.get(RuntimeConfigService),
    app.get(ImportsService),
    logger
  );
  const notificationsWorker = startNotificationsWorker(
    app.get(RuntimeConfigService),
    app.get(NotificationDeliveryService),
    logger
  );
  const billStatementsWorker = startBillStatementsWorker(
    app.get(RuntimeConfigService),
    app.get(BillReconciliationService),
    logger
  );
  const spendingWarningsWorker = startSpendingWarningsWorker(
    app.get(RuntimeConfigService),
    app.get(SpendingWarningsService),
    logger
  );
  logger.log({ event: "worker.started" }, "worker process started");

  let isShuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    clearInterval(heartbeatTimer);
    logger.log({ event: LogEvent.WorkerStopping, signal }, "worker process stopping");

    const results = await Promise.allSettled([
      importsWorker.close(),
      notificationsWorker.close(),
      billStatementsWorker.close(),
      spendingWarningsWorker.close()
    ]);
    for (const result of results) {
      if (result.status === "rejected") {
        logger.error(
          { event: LogEvent.WorkerStopping, err: result.reason },
          "worker queue shutdown failed"
        );
      }
    }
    await app.close();
    logger.log({ event: LogEvent.WorkerStopped }, "worker process stopped");
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

void bootstrapWorker();
