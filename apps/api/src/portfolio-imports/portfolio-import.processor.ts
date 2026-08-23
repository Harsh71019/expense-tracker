import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LoggingContextService } from "../common/logging/logging-context.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";
import { isTerminalJobFailure } from "../common/queue/queue-policy.js";
import {
  PORTFOLIO_IMPORTS_QUEUE_NAME,
  PortfolioImportJobDataSchema,
  type PortfolioImportJobData
} from "./portfolio-import.queue.js";
import { PortfolioImportService } from "./portfolio-import.service.js";

export function startPortfolioImportsWorker(
  config: RuntimeConfigService,
  service: PortfolioImportService,
  logger: Pick<Logger, "log" | "error">,
  context: LoggingContextService = new LoggingContextService()
): Worker<PortfolioImportJobData> {
  return new Worker<PortfolioImportJobData>(
    PORTFOLIO_IMPORTS_QUEUE_NAME,
    async (job: Job<PortfolioImportJobData>) => {
      const startedAt = performance.now();
      const data = PortfolioImportJobDataSchema.parse(job.data);
      return context.run(
        {
          reqId: data.correlationId,
          jobId: job.id ?? data.batchId,
          jobName: job.name,
          userId: data.userId,
          batchId: data.batchId
        },
        async () => {
          await service.processQueuedBatch(data.batchId, data.userId);
          logger.log(
            {
              event: "portfolio_import.parsed",
              batchId: data.batchId,
              durationMs: Math.round(performance.now() - startedAt)
            },
            "portfolio import parse job completed"
          );
        }
      );
    },
    { connection: createQueueConnection(config.env.REDIS_URL) }
  ).on("failed", (job, error) => {
    const parsed = job === undefined ? undefined : PortfolioImportJobDataSchema.safeParse(job.data);
    const terminal = job !== undefined && isTerminalJobFailure(job);
    if (job !== undefined && parsed?.success === true && terminal) {
      void service
        .markJobFailed(parsed.data.batchId, parsed.data.userId, error)
        .catch((stateError: unknown) => {
          logger.error(
            {
              event: "portfolio_import.failure_state_update_failed",
              batchId: parsed.data.batchId,
              err: stateError
            },
            "portfolio import failure state update failed"
          );
        });
    }
    logger.error(
      {
        event: "portfolio_import.job_failed",
        ...(job?.id === undefined ? {} : { jobId: job.id }),
        jobName: job?.name ?? "unknown",
        ...(parsed?.success === true
          ? {
              reqId: parsed.data.correlationId,
              batchId: parsed.data.batchId
            }
          : {}),
        terminal,
        attemptsMade: job?.attemptsMade,
        err: error
      },
      "portfolio import job failed"
    );
  });
}
