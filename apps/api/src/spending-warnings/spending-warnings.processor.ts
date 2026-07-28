import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LogEvent } from "../common/logging/events.js";
import { LoggingContextService } from "../common/logging/logging-context.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";
import {
  ANALYZE_USER_JOB_NAME,
  AnalyzeUserJobDataSchema,
  type AnalyzeUserJobData,
  SPENDING_WARNINGS_QUEUE_NAME
} from "./spending-warnings.queue.js";
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
  logger: Pick<Logger, "log" | "error">,
  context: LoggingContextService = new LoggingContextService()
): Worker<AnalyzeUserJobData> {
  return new Worker<AnalyzeUserJobData>(
    SPENDING_WARNINGS_QUEUE_NAME,
    async (job: Job<AnalyzeUserJobData>) => {
      const startedAt = performance.now();
      const data = AnalyzeUserJobDataSchema.parse(job.data);
      return context.run(
        {
          reqId: data.correlationId,
          jobId: job.id ?? `${data.userId}:${data.asOf}`,
          jobName: job.name,
          userId: data.userId
        },
        async () => {
          const state = await service.analyzeUser(data.userId, new Date(data.asOf));
          const durationMs = performance.now() - startedAt;
          logger.log(
            {
              event: LogEvent.SpendingWarningsAnalyzed,
              detectorVersion: data.detectorVersion,
              status: state.status,
              eligibleKindCount: state.eligibleKinds.length,
              durationMs: Math.round(durationMs)
            },
            "spending warnings analyzed"
          );
        }
      );
    },
    { connection: createQueueConnection(config.env.REDIS_URL) }
  ).on("failed", (job, error) => {
    const data = job === undefined ? undefined : AnalyzeUserJobDataSchema.safeParse(job.data);
    logger.error(
      {
        event: LogEvent.SpendingWarningsAnalyzeFailed,
        ...(job?.id === undefined ? {} : { jobId: job.id }),
        jobName: job?.name ?? ANALYZE_USER_JOB_NAME,
        ...(data?.success === true
          ? {
              reqId: data.data.correlationId,
              userId: data.data.userId,
              detectorVersion: data.data.detectorVersion
            }
          : {}),
        err: error
      },
      "spending warnings analysis job failed"
    );
  });
}
