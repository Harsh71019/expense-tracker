import { Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import type { BillStatementUploadId, ColumnMapping, CreditCardBillId } from "@treasury-ops/shared";
import { Queue } from "bullmq";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";

export const BILL_STATEMENTS_QUEUE_NAME = "bill-statements";
export const PARSE_BILL_STATEMENT_JOB_NAME = "parse";

export type ParseBillStatementJobData = Readonly<{
  uploadId: BillStatementUploadId;
  billId: CreditCardBillId;
  userId: string;
  mapping: ColumnMapping;
  fileContentBase64: string;
}>;

@Injectable()
export class BillStatementsQueue implements OnModuleDestroy {
  private readonly queue: Queue<ParseBillStatementJobData>;

  constructor(config: RuntimeConfigService) {
    this.queue = new Queue<ParseBillStatementJobData>(BILL_STATEMENTS_QUEUE_NAME, {
      connection: createQueueConnection(config.env.REDIS_URL)
    });
  }

  getQueue(): Queue<ParseBillStatementJobData> {
    return this.queue;
  }

  async enqueueParse(data: ParseBillStatementJobData): Promise<void> {
    await this.queue.add(PARSE_BILL_STATEMENT_JOB_NAME, data, {
      jobId: data.uploadId,
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
