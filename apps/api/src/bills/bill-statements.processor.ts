import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";
import { LogEvent } from "../common/logging/events.js";
import { BillReconciliationService } from "./bill-reconciliation.service.js";
import {
  BILL_STATEMENTS_QUEUE_NAME,
  type ParseBillStatementJobData
} from "./bill-statements.queue.js";

export function startBillStatementsWorker(
  config: RuntimeConfigService,
  service: BillReconciliationService,
  logger: Pick<Logger, "log" | "error">
): Worker<ParseBillStatementJobData> {
  return new Worker<ParseBillStatementJobData>(
    BILL_STATEMENTS_QUEUE_NAME,
    async (job: Job<ParseBillStatementJobData>) => {
      const { uploadId, billId, userId, mapping, fileContentBase64 } = job.data;
      const fileContent = Buffer.from(fileContentBase64, "base64").toString("utf8");
      await service.parseStatement(uploadId, billId, userId, mapping, fileContent);
      logger.log(
        { event: LogEvent.BillStatementParsed, uploadId, billId },
        "credit-card statement parsed"
      );
    },
    { connection: createQueueConnection(config.env.REDIS_URL) }
  ).on("failed", (job, error) => {
    logger.error(
      {
        event: LogEvent.BillStatementParseFailed,
        uploadId: job?.data.uploadId,
        billId: job?.data.billId,
        err: error
      },
      "credit-card statement parse job failed"
    );
  });
}
