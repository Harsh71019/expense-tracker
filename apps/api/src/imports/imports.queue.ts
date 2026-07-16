import { Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import type { ColumnMapping, ImportBatchId } from "@vyaya/shared";
import { Queue } from "bullmq";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { createQueueConnection } from "../common/queue/queue-connection.js";

export const IMPORTS_QUEUE_NAME = "imports";
export const PARSE_IMPORT_JOB_NAME = "parse";

export type ParseImportJobData = Readonly<{
  batchId: ImportBatchId;
  userId: string;
  accountId: string;
  mapping: ColumnMapping;
  /** Base64-encoded raw CSV bytes — see HANDOFF note in imports.processor.ts. */
  fileContentBase64: string;
}>;

@Injectable()
export class ImportsQueue implements OnModuleDestroy {
  private readonly queue: Queue<ParseImportJobData>;

  constructor(config: RuntimeConfigService) {
    this.queue = new Queue<ParseImportJobData>(IMPORTS_QUEUE_NAME, {
      connection: createQueueConnection(config.env.REDIS_URL)
    });
  }

  async enqueueParse(data: ParseImportJobData): Promise<void> {
    await this.queue.add(PARSE_IMPORT_JOB_NAME, data, {
      // One parse job per batch: a duplicate enqueue for the same batchId
      // (e.g. a retried HTTP request) is a no-op, not a second job.
      jobId: data.batchId,
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
