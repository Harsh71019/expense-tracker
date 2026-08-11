import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LogEvent } from "../common/logging/events.js";
import { LoggingContextService } from "../common/logging/logging-context.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";
import {
  ANALYZE_RECURRING_USER_JOB_NAME,
  RECURRING_DETECTION_QUEUE_NAME,
  RecurringDetectionJobDataSchema,
  type RecurringDetectionJobData
} from "./recurring-detection.queue.js";
import { RecurringDetectionService } from "./recurring-detection.service.js";

export function startRecurringDetectionWorker(
  config: RuntimeConfigService,
  service: RecurringDetectionService,
  logger: Pick<Logger, "log" | "error">,
  context: LoggingContextService = new LoggingContextService()
): Worker<RecurringDetectionJobData> {
  return new Worker<RecurringDetectionJobData>(
    RECURRING_DETECTION_QUEUE_NAME,
    async (job: Job<RecurringDetectionJobData>) => {
      const data = RecurringDetectionJobDataSchema.parse(job.data);
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
              event: LogEvent.RecurringDetectionAnalyzed,
              detectorVersion: result.detectorVersion,
              status: result.status,
              streamCount: result.totalStreamCount,
              abstainedGroupCount: result.abstainedGroupCount,
              rowsScanned: result.resources.rowsScanned,
              runtimeMs: result.resources.runtimeMs
            },
            "recurring detection shadow analysis completed"
          );
        }
      );
    },
    { connection: createQueueConnection(config.env.REDIS_URL) }
  ).on("failed", (job, error) => {
    const parsed =
      job === undefined ? undefined : RecurringDetectionJobDataSchema.safeParse(job.data);
    logger.error(
      {
        event: LogEvent.RecurringDetectionAnalyzeFailed,
        ...(job?.id === undefined ? {} : { jobId: job.id }),
        jobName: job?.name ?? ANALYZE_RECURRING_USER_JOB_NAME,
        ...(parsed?.success === true
          ? { detectorVersion: parsed.data.detectorVersion, reqId: parsed.data.correlationId }
          : {}),
        err: error
      },
      "recurring detection shadow analysis failed"
    );
  });
}
