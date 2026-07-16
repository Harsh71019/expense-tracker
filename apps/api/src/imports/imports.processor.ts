import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";
import { LogEvent } from "../common/logging/events.js";
import { IMPORTS_QUEUE_NAME } from "./imports.queue.js";
import type { ParseImportJobData } from "./imports.queue.js";
import { ImportsService } from "./imports.service.js";

/**
 * Instantiated only by the worker process (worker.ts) — never by the API
 * process, which only ever enqueues via ImportsQueue. Keeping the request
 * cycle free of job processing is the point of the whole worker split.
 */
export function startImportsWorker(
  config: RuntimeConfigService,
  service: ImportsService,
  logger: Pick<Logger, "log" | "error">
): Worker<ParseImportJobData> {
  return new Worker<ParseImportJobData>(
    IMPORTS_QUEUE_NAME,
    async (job: Job<ParseImportJobData>) => {
      const { batchId, userId, accountId, mapping, fileContentBase64 } = job.data;
      const fileContent = Buffer.from(fileContentBase64, "base64").toString("utf8");
      await service.parseFile(batchId, userId, accountId, mapping, fileContent);
      logger.log({ event: LogEvent.ImportBatchParsed, batchId }, "import batch parsed");
    },
    { connection: createQueueConnection(config.env.REDIS_URL) }
  ).on("failed", (job, error) => {
    logger.error(
      { event: LogEvent.ImportBatchParseFailed, batchId: job?.data.batchId, err: error },
      "import batch parse job failed"
    );
  });
}
