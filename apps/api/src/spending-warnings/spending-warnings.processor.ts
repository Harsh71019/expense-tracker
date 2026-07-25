import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";
import { LogEvent } from "../common/logging/events.js";
import type { AnalyzeUserJobData } from "./spending-warnings.queue.js";
import { SPENDING_WARNINGS_QUEUE_NAME } from "./spending-warnings.queue.js";
import { SpendingWarningsService } from "./spending-warnings.service.js";

/**
 * Instantiated only by the worker process (worker.ts) — the API process
 * only ever enqueues via SpendingWarningsQueue, mirroring
 * imports.processor.ts / notifications.processor.ts. Logs event name,
 * detector version, user id, duration, and result counts only — never
 * descriptions, amounts, evidence payloads, category names, or
 * transaction data (plan §8).
 */
export function startSpendingWarningsWorker(
  config: RuntimeConfigService,
  service: SpendingWarningsService,
  logger: Pick<Logger, "log" | "error">
): Worker<AnalyzeUserJobData> {
  return new Worker<AnalyzeUserJobData>(
    SPENDING_WARNINGS_QUEUE_NAME,
    async (job: Job<AnalyzeUserJobData>) => {
      const startedAt = performance.now();
      const { userId, asOf, detectorVersion } = job.data;
      const state = await service.analyzeUser(userId, new Date(asOf));
      logger.log(
        {
          event: LogEvent.SpendingWarningsAnalyzed,
          userId,
          detectorVersion,
          status: state.status,
          eligibleKindCount: state.eligibleKinds.length,
          durationMs: Math.round(performance.now() - startedAt)
        },
        "spending warnings analyzed"
      );
    },
    { connection: createQueueConnection(config.env.REDIS_URL) }
  ).on("failed", (job, error) => {
    logger.error(
      {
        event: LogEvent.SpendingWarningsAnalyzeFailed,
        userId: job?.data.userId,
        detectorVersion: job?.data.detectorVersion,
        err: error
      },
      "spending warnings analysis job failed"
    );
  });
}
