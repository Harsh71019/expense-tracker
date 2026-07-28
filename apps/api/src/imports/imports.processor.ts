import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LogEvent } from "../common/logging/events.js";
import { LoggingContextService } from "../common/logging/logging-context.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";
import { isTerminalJobFailure } from "../common/queue/queue-policy.js";
import { ImportWorkflowJobDataSchema, type ImportWorkflowJobData } from "./import-workflow.js";
import { IMPORTS_QUEUE_NAME } from "./imports.queue.js";
import { ImportsService } from "./imports.service.js";

export function startImportsWorker(
  config: RuntimeConfigService,
  service: ImportsService,
  logger: Pick<Logger, "log" | "error">,
  context: LoggingContextService = new LoggingContextService()
): Worker<ImportWorkflowJobData> {
  return new Worker<ImportWorkflowJobData>(
    IMPORTS_QUEUE_NAME,
    async (job: Job<ImportWorkflowJobData>) => {
      const startedAt = performance.now();
      const data = ImportWorkflowJobDataSchema.parse(job.data);
      return context.run(
        {
          reqId: data.correlationId,
          jobId: job.id ?? data.claimToken,
          jobName: job.name,
          userId: data.userId,
          batchId: data.batchId
        },
        async () => {
          await service.runWorkflow(data);
          logger.log(
            {
              event: LogEvent.ImportWorkflowCompleted,
              operation: data.operation,
              durationMs: Math.round(performance.now() - startedAt)
            },
            "import workflow completed"
          );
        }
      );
    },
    { connection: createQueueConnection(config.env.REDIS_URL) }
  ).on("failed", (job, error) => {
    const parsed = job === undefined ? undefined : ImportWorkflowJobDataSchema.safeParse(job.data);
    const terminal = job !== undefined && isTerminalJobFailure(job);
    if (job !== undefined && parsed?.success === true && terminal) {
      void service.markWorkflowFailed(parsed.data, error).catch((stateError: unknown) => {
        logger.error(
          {
            event: LogEvent.ImportWorkflowStateUpdateFailed,
            batchId: parsed.data.batchId,
            operation: parsed.data.operation,
            err: stateError
          },
          "import workflow failure state update failed"
        );
      });
    }
    logger.error(
      {
        event: LogEvent.ImportWorkflowFailed,
        ...(job?.id === undefined ? {} : { jobId: job.id }),
        jobName: job?.name ?? "unknown",
        ...(parsed?.success === true
          ? {
              reqId: parsed.data.correlationId,
              batchId: parsed.data.batchId,
              operation: parsed.data.operation
            }
          : {}),
        terminal,
        attemptsMade: job?.attemptsMade,
        err: error
      },
      "import workflow job failed"
    );
  });
}
