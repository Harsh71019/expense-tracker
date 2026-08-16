import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LogEvent } from "../common/logging/events.js";
import { LoggingContextService } from "../common/logging/logging-context.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";
import {
  SPENDING_CHANGE_JOB_NAME,
  SPENDING_CHANGE_QUEUE_NAME,
  SpendingChangeJobDataSchema,
  type SpendingChangeJobData
} from "./spending-change-detection.queue.js";
import { SpendingChangeDetectionService } from "./spending-change-detection.service.js";

export function startSpendingChangeDetectionWorker(
  config: RuntimeConfigService,
  service: SpendingChangeDetectionService,
  logger: Pick<Logger, "log" | "error">,
  context: LoggingContextService = new LoggingContextService()
): Worker<SpendingChangeJobData> {
  return new Worker<SpendingChangeJobData>(
    SPENDING_CHANGE_QUEUE_NAME,
    async (job: Job<SpendingChangeJobData>) => {
      const data = SpendingChangeJobDataSchema.parse(job.data);
      await context.run(
        {
          reqId: data.correlationId,
          jobId: job.id ?? `${data.userId}:${data.asOf}`,
          jobName: job.name,
          userId: data.userId
        },
        async () => {
          const result = await service.analyzeUser(data.userId, new Date(data.asOf));
          logger.log(
            {
              event: LogEvent.SpendingChangeAnalyzed,
              detectorVersion: result.detectorVersion,
              status: result.status,
              recurringChangesCount: result.recurringChangesCount,
              regimesCount: result.regimesCount,
              abstainedCount: result.abstainedCount,
              rowsScanned: result.resources.rowsScanned,
              runtimeMs: result.resources.runtimeMs
            },
            "spending change detection shadow analysis completed"
          );
        }
      );
    },
    { connection: createQueueConnection(config.env.REDIS_URL) }
  ).on("failed", (job, error) => {
    const parsed = job === undefined ? undefined : SpendingChangeJobDataSchema.safeParse(job.data);
    logger.error(
      {
        event: LogEvent.SpendingChangeAnalyzeFailed,
        ...(job?.id === undefined ? {} : { jobId: job.id }),
        jobName: job?.name ?? SPENDING_CHANGE_JOB_NAME,
        ...(parsed?.success === true
          ? { detectorVersion: parsed.data.detectorVersion, reqId: parsed.data.correlationId }
          : {}),
        err: error
      },
      "spending change detection shadow analysis failed"
    );
  });
}
