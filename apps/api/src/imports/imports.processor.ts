import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { LogEvent } from "../common/logging/events.js";
import { LoggingContextService } from "../common/logging/logging-context.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";
import {
  IMPORTS_QUEUE_NAME,
  PARSE_IMPORT_JOB_NAME,
  ParseImportJobDataSchema,
  type ParseImportJobData
} from "./imports.queue.js";
import { ImportsService } from "./imports.service.js";

/**
 * Instantiated only by the worker process (worker.ts) — never by the API
 * process, which only ever enqueues via ImportsQueue. Keeping the request
 * cycle free of job processing is the point of the whole worker split.
 */
export function startImportsWorker(
  config: RuntimeConfigService,
  service: ImportsService,
  logger: Pick<Logger, "log" | "error">,
  context: LoggingContextService = new LoggingContextService()
): Worker<ParseImportJobData> {
  return new Worker<ParseImportJobData>(
    IMPORTS_QUEUE_NAME,
    async (job: Job<ParseImportJobData>) => {
      const startedAt = performance.now();
      const data = ParseImportJobDataSchema.parse(job.data);
      return context.run(
        {
          reqId: data.correlationId,
          jobId: job.id ?? data.batchId,
          jobName: job.name,
          userId: data.userId,
          batchId: data.batchId
        },
        async () => {
          const fileContent = Buffer.from(data.fileContentBase64, "base64").toString("utf8");
          await service.parseFile(
            data.batchId,
            data.userId,
            data.accountId,
            data.mapping,
            fileContent
          );
          const durationMs = performance.now() - startedAt;
          logger.log(
            { event: LogEvent.ImportBatchParsed, durationMs: Math.round(durationMs) },
            "import batch parsed"
          );
        }
      );
    },
    { connection: createQueueConnection(config.env.REDIS_URL) }
  ).on("failed", (job, error) => {
    const data = job === undefined ? undefined : ParseImportJobDataSchema.safeParse(job.data);
    logger.error(
      {
        event: LogEvent.ImportBatchParseFailed,
        ...(job?.id === undefined ? {} : { jobId: job.id }),
        jobName: job?.name ?? PARSE_IMPORT_JOB_NAME,
        ...(data?.success === true
          ? { reqId: data.data.correlationId, batchId: data.data.batchId }
          : {}),
        err: error
      },
      "import batch parse job failed"
    );
  });
}
