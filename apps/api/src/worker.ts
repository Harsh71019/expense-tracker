import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import pino from "pino";

import { AppModule } from "./app.module.js";
import { BillReconciliationService } from "./bills/bill-reconciliation.service.js";
import { startBillStatementsWorker } from "./bills/bill-statements.processor.js";
import { RuntimeConfigService } from "./common/config/runtime-config.service.js";
import { LogEvent } from "./common/logging/events.js";
import { LoggingContextService } from "./common/logging/logging-context.service.js";
import { NtfyOpsNotifierService } from "./common/observability/ntfy-ops-notifier.service.js";
import { withDeadline } from "./common/process/deadline.js";
import { RedisService } from "./common/redis/redis.service.js";
import { ImportsService } from "./imports/imports.service.js";
import { startForecastingWorker } from "./insights/forecasting/forecasting.processor.js";
import { ForecastingService } from "./insights/forecasting/forecasting.service.js";
import { startImportsWorker } from "./imports/imports.processor.js";
import { NotificationDeliveryService } from "./notifications/notification-delivery.service.js";
import { startNotificationsWorker } from "./notifications/notifications.processor.js";
import { SpendingWarningsService } from "./spending-warnings/spending-warnings.service.js";
import { startSpendingWarningsWorker } from "./spending-warnings/spending-warnings.processor.js";
import { startRecurringDetectionWorker } from "./recurring-detection/recurring-detection.processor.js";
import { RecurringDetectionService } from "./recurring-detection/recurring-detection.service.js";
import { startSpendingChangeDetectionWorker } from "./spending-change-detection/spending-change-detection.processor.js";
import { SpendingChangeDetectionService } from "./spending-change-detection/spending-change-detection.service.js";
import { PortfolioImportService } from "./portfolio-imports/portfolio-import.service.js";
import { startPortfolioImportsWorker } from "./portfolio-imports/portfolio-import.processor.js";

async function bootstrapWorker(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const redis = app.get(RedisService);
  const logger = app.get(Logger);
  const config = app.get(RuntimeConfigService);
  const loggingContext = app.get(LoggingContextService);

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

  const importsWorker = startImportsWorker(config, app.get(ImportsService), logger, loggingContext);
  const notificationsWorker = startNotificationsWorker(
    app.get(RuntimeConfigService),
    app.get(NotificationDeliveryService),
    logger,
    loggingContext
  );
  const billStatementsWorker = startBillStatementsWorker(
    app.get(RuntimeConfigService),
    app.get(BillReconciliationService),
    logger
  );
  const spendingWarningsWorker = startSpendingWarningsWorker(
    app.get(RuntimeConfigService),
    app.get(SpendingWarningsService),
    logger,
    loggingContext
  );
  const recurringDetectionWorker = startRecurringDetectionWorker(
    app.get(RuntimeConfigService),
    app.get(RecurringDetectionService),
    logger,
    loggingContext
  );
  const spendingChangeDetectionWorker = startSpendingChangeDetectionWorker(
    app.get(RuntimeConfigService),
    app.get(SpendingChangeDetectionService),
    logger,
    loggingContext
  );
  const portfolioImportsWorker = startPortfolioImportsWorker(
    config,
    app.get(PortfolioImportService),
    logger,
    loggingContext
  );
  const forecastingWorker = startForecastingWorker(config, app.get(ForecastingService), logger);
  logger.log({ event: LogEvent.WorkerStarted, sha: config.env.GIT_SHA }, "worker process started");
  await app.get(NtfyOpsNotifierService).notify({
    title: "🔄 TreasuryOps worker started",
    message: `sha=${config.env.GIT_SHA}`,
    tags: ["arrows_counterclockwise"]
  });

  let isShuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    clearInterval(heartbeatTimer);
    logger.log({ event: LogEvent.WorkerStopping, signal }, "worker process stopping");

    try {
      await withDeadline(
        "Worker graceful shutdown",
        config.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS,
        (async () => {
          const results = await Promise.allSettled([
            importsWorker.close(),
            notificationsWorker.close(),
            billStatementsWorker.close(),
            spendingWarningsWorker.close(),
            recurringDetectionWorker.close(),
            spendingChangeDetectionWorker.close(),
            portfolioImportsWorker.close(),
            forecastingWorker.close()
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
        })()
      );
      logger.log({ event: LogEvent.WorkerStopped }, "worker process stopped");
      // pino's pretty-print transport (LOG_PRETTY) runs in a worker thread that
      // isn't tied to Nest's lifecycle, so the event loop never drains on its own.
      process.exit(0);
    } catch (error: unknown) {
      logger.fatal(
        { event: "worker.shutdown_failed", signal, err: error },
        "worker shutdown failed"
      );
      process.exit(1);
    }
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

void bootstrapWorker().catch((error: unknown) => {
  const logger = pino({ level: process.env.LOG_LEVEL ?? "error" });
  logger.fatal({ event: "worker.bootstrap_failed", err: error }, "worker bootstrap failed");
  process.exitCode = 1;
});
